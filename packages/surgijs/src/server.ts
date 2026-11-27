import { createRoot, getOwner, type OwnerNode } from './reactivity';

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };

/** Escapes text and attribute values. `null`, `undefined` and booleans render as `''`. */
export function escape(value: unknown): string {
  if (value == null || typeof value === 'boolean') return '';
  if (Array.isArray(value)) return value.map(escape).join('');
  return ('' + (value as string)).replace(/[&<>"]/g, (c) => ESC[c]!);
}

/**
 * Text for raw text elements (`<style>`, `<script>`), where entities are not decoded: the
 * pieces are joined first, then only sequences that would end the element are neutralised
 * (`</style`, `</script`, and for scripts `<script`, which after `<!--` enters the
 * double-escaped state), each only where the HTML tokenizer sees a tag name end. `<` becomes
 * `\u003c`, valid inside JS and JSON strings, so `a > b`, `&` and `i<scripts.length` survive.
 * Not for SVG `<style>`/`<script>`, which are foreign content: use `escape` there.
 */
export function escapeRaw(value: unknown, tag: string): string {
  const text = (v: unknown): string =>
    v == null || typeof v === 'boolean' ? '' : Array.isArray(v) ? v.map(text).join('') : '' + (v as string);
  return text(value).replace(tag === 'script' ? /<(\/)?(script)(?=[\t\n\f />])/gi : /<(\/)(style)(?=[\t\n\f />])/gi, (_, slash, word) =>
    slash ? `<\\/${word}` : `\\u003c${word}`,
  );
}

/** ` name="value"`, ` name` for `true`, `''` for `null`/`false`. */
export function attrPart(name: string, value: unknown): string {
  if (value == null || value === false) return '';
  if (value === true) return ' ' + name;
  return ` ${name}="${escape(typeof value === 'object' ? JSON.stringify(value) : value)}"`;
}

const kebab = (s: string): string => s.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());

export interface ShadowOptions {
  /** Light DOM markup after the template, projected into the shadow root's slots. Not escaped. */
  children?: string;
  /** Adds `shadowrootdelegatesfocus`, matching `attachShadow({ delegatesFocus: true })`. */
  delegatesFocus?: boolean;
  /** CSS rendered as `<style data-s>` inside the shadow root; the client swaps it for a shared adopted sheet. */
  styles?: string | string[];
}

function shadowOpen(tag: string, attrs: Record<string, unknown>, options: ShadowOptions): string {
  let a = '';
  for (const k in attrs) a += attrPart(kebab(k), attrs[k]);
  const focus = options.delegatesFocus ? ' shadowrootdelegatesfocus' : '';
  const css = ([] as string[]).concat(options.styles ?? []).map((c) => `<style data-s>${escapeRaw(c, 'style')}</style>`).join('');
  return `<${tag}${a}><template shadowrootmode="open"${focus}>${css}`;
}

function shadowClose(tag: string, options: ShadowOptions): string {
  return `</template>${options.children ?? ''}</${tag}>`;
}

/** `<tag a="1"><template shadowrootmode="open">inner</template>children</tag>`. */
export function shadowHTML(tag: string, inner: string, attrs: Record<string, unknown> = {}, options: ShadowOptions = {}): string {
  return shadowOpen(tag, attrs, options) + inner + shadowClose(tag, options);
}

/*
 * Server output is a tree of parts, walked once. A string is static HTML written by the
 * compiler, an `Html` node holds parts, an array is a list of parts, a function is a deferred
 * part (a nested component or a branch) and a promise is an async value that only
 * `renderToStream` waits for. Values that come from user code pass through `text`, which
 * escapes them, so a bare string in the tree is always raw HTML.
 */
type Part = string | Html | Part[] | Promise<Part> | (() => Part);

class Html {
  constructor(readonly parts: Part[]) {}
}

const isPromise = (v: unknown): v is Promise<unknown> => v != null && typeof (v as Promise<unknown>).then === 'function';

/** A compiled element. */
export function element(parts: Part[]): Html {
  return new Html(parts);
}

/** A text hole: escapes values, keeps elements, maps arrays, calls accessors, waits on promises. */
export function text(value: unknown): Part {
  if (value == null || typeof value === 'boolean' || value === '') return '';
  if (value instanceof Html || (value as Partial<MatchCase>)[MATCH]) return value as Part;
  if (Array.isArray(value)) return value.map(text);
  if (typeof value === 'function') return text((value as () => unknown)());
  if (isPromise(value)) return value.then(text) as Promise<Part>;
  return new Html([escape(value)]);
}

/** Runs `fn` in a root under the owner that is current where the thunk is created, so contexts reach it. */
function later(fn: () => unknown): () => Part {
  const owner: OwnerNode | null = getOwner();
  return () =>
    text(
      createRoot((dispose) => {
        const out = fn();
        dispose();
        return out;
      }, owner),
    );
}

/** Renders a component as a deferred part. Async components return a promise, which streams wait for. */
export function component<P>(fn: (props: P) => unknown, props: P): () => Part {
  return later(() => fn(props));
}

const read = <T>(v: T | (() => T)): T => (typeof v === 'function' ? (v as () => T)() : v);
const truthy = (v: unknown): boolean => v != null && v !== false;
const resolve = (c: unknown, value?: unknown): unknown => (typeof c === 'function' ? (c as (v?: unknown) => unknown)(value) : c);

/** Evaluates every deferred part now, keeping the structure and promises. Used where errors must be caught. */
function settle(p: unknown): unknown {
  if (typeof p === 'function') return settle((p as () => unknown)());
  if (p instanceof Html) return new Html(p.parts.map(settle) as Part[]);
  if (Array.isArray(p)) return p.map(settle);
  return p;
}

/** Wraps promises and deferred parts so that a failure inside them becomes `fail(err)`. */
function guard(p: unknown, fail: (err: unknown) => Part): unknown {
  if (isPromise(p)) return (p as Promise<unknown>).then((v) => guard(v, fail), (err) => fail(err));
  if (p instanceof Html) return new Html(p.parts.map((x) => guard(x, fail)) as Part[]);
  if (Array.isArray(p)) return p.map((x) => guard(x, fail));
  if (typeof p === 'function') {
    return () => {
      try {
        return guard((p as () => unknown)(), fail) as Part;
      } catch (err) {
        return fail(err);
      }
    };
  }
  return p;
}

interface ShowProps<T> {
  when: T | (() => T);
  fallback?: unknown;
  children: unknown;
}

export function Show<T>(props: ShowProps<T>): () => Part {
  return later(() => {
    const v = read(props.when);
    return truthy(v) ? resolve(props.children, v) : resolve(props.fallback);
  });
}

interface ForProps<T> {
  each: readonly T[] | null | undefined | (() => readonly T[] | null | undefined);
  children: (item: T, index: () => number) => unknown;
}

export function For<T>(props: ForProps<T>): () => Part {
  return later(() => {
    const items = read(props.each) || [];
    return items.map((item, i) => later(() => props.children(item, () => i)));
  });
}

const MATCH = Symbol('match');

interface MatchProps<T> {
  when: T | (() => T);
  children: unknown;
}

interface MatchCase {
  [MATCH]: true;
  when: unknown;
  children: unknown;
}

export function Match<T>(props: MatchProps<T>): MatchCase {
  return { [MATCH]: true, when: props.when, children: props.children };
}

const collectCases = (v: unknown, out: MatchCase[]): void => {
  if (typeof v === 'function') collectCases((v as () => unknown)(), out);
  else if (Array.isArray(v)) v.forEach((x) => collectCases(x, out));
  else if (v && (v as Partial<MatchCase>)[MATCH]) out.push(v as MatchCase);
};

interface SwitchProps {
  fallback?: unknown;
  children: unknown;
}

export function Switch(props: SwitchProps): () => Part {
  return later(() => {
    const cases: MatchCase[] = [];
    collectCases(resolve(props.children), cases);
    const hit = cases.find((c) => truthy(read(c.when)));
    return hit ? resolve(hit.children, read(hit.when)) : resolve(props.fallback);
  });
}

/** Portals mount into the live document, so nothing is rendered in place on the server. */
export function Portal(): () => Part {
  return later(() => '');
}

interface ErrorBoundaryProps {
  fallback: unknown;
  children: unknown;
}

/** Renders `fallback` for a failure in its children, synchronous or async, before or during streaming. */
export function ErrorBoundary(props: ErrorBoundaryProps): () => Part {
  return later(() => {
    const fail = (err: unknown): Part => {
      const f = props.fallback;
      return text(typeof f === 'function' ? (f as (e: unknown, reset: () => void) => unknown)(err, () => {}) : f);
    };
    try {
      return guard(settle(resolve(props.children)), fail) as Part;
    } catch (err) {
      return fail(err);
    }
  });
}

const pushReversed = (stack: unknown[], items: readonly unknown[]): void => {
  for (let i = items.length - 1; i >= 0; i--) stack.push(items[i]);
};

/** Calls the deferred parts among `items`, so async siblings start before any of them is awaited. */
const expand = (items: readonly unknown[]): unknown[] => items.map((x) => (typeof x === 'function' ? (x as () => unknown)() : x));

/** Concatenates a part tree. Throws if it reaches a promise: use `renderToStream` for async parts. */
function toHtml(root: unknown): string {
  let out = '';
  const stack: unknown[] = [root];
  while (stack.length) {
    const p = stack.pop();
    if (typeof p === 'string') out += p;
    else if (p instanceof Html) pushReversed(stack, p.parts);
    else if (Array.isArray(p)) pushReversed(stack, p);
    else if (typeof p === 'function') stack.push((p as () => unknown)());
    else if (isPromise(p)) throw new Error('surgijs: renderToString met an async value. Use renderToStream.');
    else if (p != null && typeof p !== 'boolean') out += String(p);
  }
  return out;
}

/** Yields the part tree in order, flushing the buffered HTML before each wait on a promise. */
async function* streamHtml(root: unknown): AsyncGenerator<string> {
  let buf = '';
  const stack: unknown[] = [root];
  while (stack.length) {
    const p = stack.pop();
    if (typeof p === 'string') buf += p;
    else if (p instanceof Html) pushReversed(stack, expand(p.parts));
    else if (Array.isArray(p)) pushReversed(stack, expand(p));
    else if (typeof p === 'function') stack.push((p as () => unknown)());
    else if (isPromise(p)) {
      if (buf) {
        yield buf;
        buf = '';
      }
      stack.push(await p);
    } else if (p != null && typeof p !== 'boolean') buf += String(p);
  }
  if (buf) yield buf;
}

type View<P> = (props: { [K in keyof P]: () => P[K] }, host?: unknown) => unknown;

/** Calls the view once inside a root and disposes the root; nested parts keep their own owners. */
function mount<P extends Record<string, unknown>>(view: View<P>, props: P): unknown {
  const bag = new Proxy({} as { [K in keyof P]: () => P[K] }, {
    get: (_, k) => () => props[k as keyof P],
  });
  return text(
    createRoot((dispose) => {
      const out = view(bag);
      dispose();
      return out;
    }),
  );
}

/**
 * Renders a component compiled with `generate: 'ssr'` into its host tag with a declarative
 * shadow root. `props` become getters, like attributes on the client; `options` adds light
 * DOM children and focus delegation.
 */
export function renderToString<P extends Record<string, unknown>>(
  tag: string,
  view: View<P>,
  props: P = {} as P,
  options: ShadowOptions = {},
): string {
  return shadowHTML(tag, toHtml(mount(view, props)), props, options);
}

async function* streamShadow<P extends Record<string, unknown>>(
  tag: string,
  view: View<P>,
  props: P,
  options: ShadowOptions,
): AsyncGenerator<string> {
  const root = mount(view, props);
  yield shadowOpen(tag, props, options);
  yield* streamHtml(root);
  yield shadowClose(tag, options);
}

/**
 * Streams the markup of `renderToString` as it is produced. The shell goes out first, then
 * each run of HTML up to an async value (a promise in a hole, or an async component), which
 * is sent when it resolves. Siblings that are async components start together.
 */
export function renderToStream<P extends Record<string, unknown>>(
  tag: string,
  view: View<P>,
  props: P = {} as P,
  options: ShadowOptions = {},
): ReadableStream<string> {
  const chunks = streamShadow(tag, view, props, options);
  return new ReadableStream<string>({
    async pull(controller) {
      const next = await chunks.next();
      if (next.done) controller.close();
      else controller.enqueue(next.value);
    },
    cancel() {
      void chunks.return(undefined);
    },
  });
}
