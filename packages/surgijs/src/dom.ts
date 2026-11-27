import { createRenderEffect, untrack } from './reactivity';

type Claim = (html: string, flags: number) => Node | null;

let claim: Claim | null = null;
let hydrating = false;

export function setClaim(fn: Claim | null): void {
  claim = fn;
}

export function setHydrating(on: boolean): boolean {
  const prev = hydrating;
  hydrating = on;
  return prev;
}

/**
 * Parses `html` once and returns a clone factory. Flag `1`: the template holds custom
 * elements and clones through `document.importNode` so they upgrade synchronously.
 * Flag `2`: the root is an SVG child and parses inside `<svg>`.
 */
export function template(html: string, flags = 0): () => Node {
  let node: Node | undefined;
  return () => {
    if (claim) {
      const claimed = claim(html, flags);
      if (claimed) return claimed;
    }
    if (!node) {
      const t = document.createElement('template');
      t.innerHTML = flags & 2 ? `<svg>${html}</svg>` : html;
      node = t.content.firstChild!;
      if (flags & 2) node = node.firstChild!;
    }
    return flags & 1 ? document.importNode(node, true) : node.cloneNode(true);
  };
}

/**
 * Renders `value` into `parent`. Without `marker` the value owns all children of `parent`;
 * `null` appends after the static children; a node inserts before that node.
 * Functions become render effects.
 */
export function insert(parent: Node, value: unknown, marker?: Node | null, initial?: unknown): void {
  const own = marker === undefined;
  const at = own ? null : marker;
  const cur: unknown = initial || [];
  if (typeof value === 'function') createRenderEffect<unknown>((c) => write(parent, (value as () => unknown)(), c, at, own), cur);
  else if (Array.isArray(value) && dynamic(value)) createRenderEffect<unknown>((c) => write(parent, value, c, at, own), cur);
  else write(parent, value, cur, at, own);
}

const dynamic = (list: unknown[]): boolean =>
  list.some((v) => typeof v === 'function' || (Array.isArray(v) && dynamic(v)));

function write(parent: Node, value: unknown, current: unknown, marker: Node | null, own: boolean): unknown {
  while (typeof current === 'function') current = current();
  if (typeof value === 'function') {
    let c = current;
    createRenderEffect(() => {
      let v = (value as () => unknown)();
      while (typeof v === 'function') v = v();
      c = write(parent, v, c, marker, own);
    });
    return () => c;
  }
  const cur = current as Node[];
  const t = typeof value;
  if (t === 'string' || t === 'number' || t === 'bigint') {
    const s = '' + (value as string);
    const first = cur[0] as Text | undefined;
    if (cur.length === 1 && first!.nodeType === 3) {
      if (first!.data !== s) first!.data = s;
      return cur;
    }
    if (own && !cur.length && !hydrating) {
      parent.textContent = s;
      return s ? [parent.firstChild!] : [];
    }
    if (hydrating && !cur.length) {
      const prev = (marker ? marker.previousSibling : parent.lastChild) as Text | null;
      if (prev && prev.nodeType === 3 && (own || prev.data === s)) {
        if (prev.data !== s) prev.data = s;
        return [prev];
      }
    }
    value = document.createTextNode(s);
  }
  const nodes: Node[] = [];
  if (value == null || t === 'boolean') {
    /* renders nothing */
  } else if ((value as Node).nodeType === 11) normalize(nodes, [...(value as Node).childNodes], cur);
  else if ((value as Node).nodeType) nodes.push(value as Node);
  else normalize(nodes, value as unknown[], cur);
  if (!cur.length) {
    for (const n of nodes) if (!hydrating || n.parentNode !== parent) parent.insertBefore(n, marker);
  } else if (!nodes.length) {
    if (own) parent.textContent = '';
    else for (const n of cur) if (n.parentNode === parent) parent.removeChild(n);
  } else diff(parent, cur, nodes);
  return nodes;
}

function normalize(out: Node[], value: unknown[], prev: Node[]): void {
  for (let v of value) {
    while (typeof v === 'function') v = v();
    if (v == null || typeof v === 'boolean') continue;
    if (Array.isArray(v)) normalize(out, v, prev);
    else if ((v as Node).nodeType) out.push(v as Node);
    else {
      const s = '' + (v as string);
      const p = prev[out.length];
      out.push(p && p.nodeType === 3 && (p as Text).data === s ? p : document.createTextNode(s));
    }
  }
}

/** Moves the DOM from node list `a` to node list `b` with few operations (udomdiff). */
export function diff(parent: Node, a: Node[], b: Node[]): void {
  const bLength = b.length;
  let aEnd = a.length;
  let bEnd = bLength;
  let aStart = 0;
  let bStart = 0;
  const after = a[aEnd - 1]!.nextSibling;
  let map: Map<Node, number> | null = null;
  while (aStart < aEnd || bStart < bEnd) {
    if (a[aStart] === b[bStart]) {
      aStart++;
      bStart++;
      continue;
    }
    while (aEnd > aStart && bEnd > bStart && a[aEnd - 1] === b[bEnd - 1]) {
      aEnd--;
      bEnd--;
    }
    if (aEnd === aStart) {
      const node = bEnd < bLength ? (bStart ? b[bStart - 1]!.nextSibling : b[bEnd - bStart]!) : after;
      while (bStart < bEnd) parent.insertBefore(b[bStart++]!, node);
    } else if (bEnd === bStart) {
      while (aStart < aEnd) {
        const n = a[aStart++]!;
        if ((!map || !map.has(n)) && n.parentNode === parent) parent.removeChild(n);
      }
    } else if (a[aStart] === b[bEnd - 1] && b[bStart] === a[aEnd - 1]) {
      const node = a[--aEnd]!.nextSibling;
      parent.insertBefore(b[bStart++]!, a[aStart++]!.nextSibling);
      parent.insertBefore(b[--bEnd]!, node);
      a[aEnd] = b[bEnd]!;
    } else {
      if (!map) {
        map = new Map();
        for (let i = bStart; i < bEnd; i++) map.set(b[i]!, i);
      }
      const index = map.get(a[aStart]!);
      if (index != null) {
        if (bStart < index && index < bEnd) {
          let i = aStart;
          let sequence = 1;
          let t: number | undefined;
          while (++i < aEnd && i < bEnd) {
            if ((t = map.get(a[i]!)) == null || t !== index + sequence) break;
            sequence++;
          }
          if (sequence > index - bStart) {
            const node = a[aStart]!;
            while (bStart < index) parent.insertBefore(b[bStart++]!, node);
          } else parent.replaceChild(b[bStart++]!, a[aStart++]!);
        } else aStart++;
      } else {
        const n = a[aStart++]!;
        if (n.parentNode === parent) parent.removeChild(n);
      }
    }
  }
}

/** Flattens a rendered value into DOM nodes. Functions are called once, untracked. */
export function toNodes(value: unknown, out: Node[] = []): Node[] {
  while (typeof value === 'function') value = untrack(value as () => unknown);
  if (value == null || typeof value === 'boolean') return out;
  if (Array.isArray(value)) for (let i = 0; i < value.length; i++) toNodes(value[i], out);
  else if ((value as Node).nodeType === 11) out.push(...(value as Node).childNodes);
  else if ((value as Node).nodeType) out.push(value as Node);
  else out.push(document.createTextNode('' + (value as string)));
  return out;
}

export function setText(node: Text, value: unknown): void {
  node.data = value == null || value === false ? '' : '' + (value as string);
}

export function className(el: Element, value: unknown): void {
  if (value == null || value === false) el.removeAttribute('class');
  else el.className = value as string;
}

export function attr(el: Element, name: string, value: unknown): void {
  if (value == null || value === false) el.removeAttribute(name);
  else el.setAttribute(name, value === true ? '' : (value as string));
}

const NS: Record<string, string> = {
  xlink: 'http://www.w3.org/1999/xlink',
  xml: 'http://www.w3.org/XML/1998/namespace',
  xmlns: 'http://www.w3.org/2000/xmlns/',
};

/** Sets a prefixed attribute (`xlink:href`, `xml:lang`, `xmlns:x`) in its namespace. */
export function attrNS(el: Element, name: string, value: unknown): void {
  const i = name.indexOf(':');
  const ns = NS[name.slice(0, i)] ?? null;
  if (value == null || value === false) el.removeAttributeNS(ns, name.slice(i + 1));
  else el.setAttributeNS(ns, name, value === true ? '' : (value as string));
}

type StyleObject = Record<string, string | number | null | undefined>;

/** Sets `style` from a string or an object; keys of the previous object missing from the next one clear. */
export function style(el: HTMLElement | SVGElement, value: unknown): void {
  const host = el as unknown as { $style?: StyleObject | null };
  const prev = host.$style;
  host.$style = null;
  if (value == null || value === false) {
    el.removeAttribute('style');
    return;
  }
  const s = el.style;
  if (typeof value === 'string') {
    s.cssText = value;
    return;
  }
  const v = (host.$style = value as StyleObject);
  for (const k in prev) if (!(k in v)) setStyle(s, k, null);
  for (const k in v) setStyle(s, k, v[k]);
}

function setStyle(s: CSSStyleDeclaration, k: string, x: string | number | null | undefined): void {
  if (k.includes('-')) {
    if (x == null) s.removeProperty(k);
    else s.setProperty(k, '' + x);
  } else (s as unknown as Record<string, unknown>)[k] = x == null ? '' : x;
}

export function use<T>(ref: ((el: T) => void) | { current: T | null } | null | undefined, el: T): void {
  if (typeof ref === 'function') ref(el);
  else if (ref) ref.current = el;
}

const delegated = new Set<string>();
const roots = new Set<Node>();
const handled = /* @__PURE__ */ new WeakSet<Event>();

function dispatch(e: Event): void {
  if (handled.has(e)) return;
  handled.add(e);
  const key = '$$' + e.type;
  const path = e.composedPath();
  for (let i = 0; i < path.length; i++) {
    const node = path[i] as unknown as Record<string, unknown>;
    const handler = node[key] as ((this: unknown, e: Event) => void) | undefined;
    if (handler && !node.disabled) {
      Object.defineProperty(e, 'currentTarget', { configurable: true, get: () => node });
      handler.call(node, e);
      if (e.cancelBubble) break;
    }
  }
}

/** Registers one document listener per event name; handlers live on elements as `$$name`. */
export function delegate(events: string[]): void {
  for (const name of events) {
    if (delegated.has(name)) continue;
    delegated.add(name);
    if (typeof document !== 'undefined') document.addEventListener(name, dispatch);
    for (const root of roots) root.addEventListener(name, dispatch);
  }
}

/** Delegates events inside a closed shadow root, which the document listener cannot see into. */
export function delegateRoot(root: Node): void {
  roots.add(root);
  for (const name of delegated) root.addEventListener(name, dispatch);
}

export function undelegateRoot(root: Node): void {
  roots.delete(root);
  for (const name of delegated) root.removeEventListener(name, dispatch);
}

const DELEGATED = /* @__PURE__ */ new Set([
  'click',
  'dblclick',
  'contextmenu',
  'input',
  'beforeinput',
  'keydown',
  'keyup',
  'focusin',
  'focusout',
  'pointerdown',
  'pointerup',
  'pointermove',
  'pointerover',
  'pointerout',
  'mousedown',
  'mouseup',
  'mousemove',
  'mouseover',
  'mouseout',
  'touchstart',
  'touchend',
  'touchmove',
]);

/** Sets one property or attribute the way the compiler would for a known name. */
export function setProp(el: Element, k: string, v: unknown): void {
  if (k === 'style') style(el as HTMLElement, v);
  else if (k === 'class' || k === 'className') className(el, v);
  else if (k === 'htmlFor' && !el.localName.includes('-')) attr(el, 'for', v);
  else if (k.startsWith('attr:')) attr(el, k.slice(5), v);
  else if (k.startsWith('prop:')) (el as unknown as Record<string, unknown>)[k.slice(5)] = v;
  else if (k.includes(':')) attrNS(el, k, v);
  else if (k in el && !k.includes('-')) (el as unknown as Record<string, unknown>)[k] = v;
  else attr(el, k, v);
}

function listen(el: Element, k: string, v: unknown): boolean {
  if (k[0] !== 'o' || k[1] !== 'n') return false;
  if (k[2] === ':') {
    el.addEventListener(k.slice(3), v as EventListener);
    return true;
  }
  const c = k[2]!;
  if (c < 'A' || c > 'Z') return false;
  const name = k.slice(2).toLowerCase();
  if (DELEGATED.has(name)) {
    (el as unknown as Record<string, unknown>)['$$' + name] = v;
    delegate([name]);
  } else el.addEventListener(name, v as EventListener);
  return true;
}

/** Applies a props object to an element: children, ref, events, reactive getters, values. */
export function spread(el: Element, props: Record<string, unknown>): void {
  for (const k in props) {
    const v = props[k];
    if (k === 'children') insert(el, v);
    else if (k === 'ref') use(v as (el: Element) => void, el);
    else if (listen(el, k, v)) continue;
    else if (typeof v === 'function') createRenderEffect(() => setProp(el, k, (v as () => unknown)()));
    else setProp(el, k, v);
  }
}

export function createComponent<P, R>(fn: (props: P) => R, props: P): R {
  return untrack(() => fn(props));
}
