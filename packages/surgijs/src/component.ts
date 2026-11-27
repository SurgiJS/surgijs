import { devRender, devUnmount } from './dev';
import { delegateRoot, insert, undelegateRoot } from './dom';
import { createRoot, createSignal, deferMount, getOwner, isDeliberate, swapUntracked, type Accessor, type OwnerNode, type Setter } from './reactivity';
import type { JSX } from './jsx-runtime';
import { warn } from './warn';

export type PropType = StringConstructor | NumberConstructor | BooleanConstructor | ObjectConstructor | ArrayConstructor;

export type Schema<P> = { [K in keyof P]?: PropType };

/**
 * Props inside a component: one getter per prop. JSX call sites take the plain values;
 * the `~props` brand carries them for type checking.
 */
export type ReactiveProps<P> = { readonly [K in keyof P]-?: Accessor<P[K]> } & {
  readonly children?: Accessor<JSX.Element>;
  readonly '~props'?: P;
};

export interface ComponentOptions<X = {}> {
  /** `{ mode: 'open' }` by default; `false` renders into light DOM. */
  shadow?: boolean | ShadowRootInit;
  /** Form-associated element with `ElementInternals`. */
  form?: boolean;
  /**
   * CSS for the shadow root. Parsed into one `CSSStyleSheet` per component definition and
   * adopted by every instance, so a hundred elements share one copy. Falls back to a
   * `<style>` per root where constructable stylesheets are missing. Ignored in light DOM.
   */
  styles?: string | string[];
  /** Events the component emits, each built with `defineEvent<T>()`. Their `detail` types make up `X`. */
  events?: X;
}

export interface FormHost extends HTMLElement {
  setFormValue(value: File | string | FormData | null): void;
  setFormValidity(flags?: ValidityStateFlags, message?: string, anchor?: HTMLElement): void;
  formDisabled: Accessor<boolean>;
}

export interface EventOptions {
  /** Default `true`. */
  bubbles?: boolean;
  /** Default `true`, so listeners outside the shadow root receive the event. */
  composed?: boolean;
  /** Default `false`. */
  cancelable?: boolean;
}

/** An event the component emits. `T` is the `detail` type; `void` means no detail. */
export interface EventDecl<T = void> extends EventOptions {
  readonly '~detail': T;
}

export type EventDecls = Record<string, EventDecl<any>>;

type DetailOf<D> = D extends EventDecl<infer T> ? T : never;

type EmitArgs<X> = {
  [K in keyof X & string]: [name: K, ...detail: [DetailOf<X[K]>] extends [void] ? [] : [detail: DetailOf<X[K]>]];
}[keyof X & string];

/** `emit(name, detail)` for the events declared in `X`; `void` events take no detail. */
export type Emit<X> = (...args: EmitArgs<X>) => boolean;

export interface TypedEventTarget<X> {
  addEventListener<K extends keyof X & string>(
    type: K,
    listener: (event: CustomEvent<DetailOf<X[K]>>) => void,
    options?: boolean | AddEventListenerOptions,
  ): void;
  removeEventListener<K extends keyof X & string>(
    type: K,
    listener: (event: CustomEvent<DetailOf<X[K]>>) => void,
    options?: boolean | EventListenerOptions,
  ): void;
}

type EventTargetOf<X> = [keyof X] extends [never] ? {} : TypedEventTarget<X>;

/** Declares an event for `defineComponent`'s `events` option. The type argument is the `detail` type. */
export function defineEvent<T = void>(options: EventOptions = {}): EventDecl<T> {
  return options as EventDecl<T>;
}

export interface ComponentClass<P, X = {}> {
  new (): EventTargetOf<X> & HTMLElement & P;
  readonly observedAttributes: string[];
}

type HydrateRoot = (root: Node) => (() => void) | null;

let hydrateRoot: HydrateRoot | null = null;

export function setHydrateRoot(fn: HydrateRoot | null): void {
  hydrateRoot = fn;
}

function makeSheet(text: string): CSSStyleSheet {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(text);
  return sheet;
}

const kebab = (s: string): string => s.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());

const updates = new WeakMap<object, (render: unknown) => void>();

function coerce(type: PropType | undefined, v: string | null): unknown {
  if (type === Boolean) return v !== null && v !== 'false';
  if (v === null) return undefined;
  if (type === Number) return +v;
  if (type && type !== String) {
    try {
      return JSON.parse(v);
    } catch {
      return undefined;
    }
  }
  return v;
}

interface Host extends HTMLElement {
  __s: Record<string, [Accessor<unknown>, Setter<unknown>]>;
  __p: Record<string, Accessor<unknown>>;
  __d: (() => void) | undefined;
  __o: OwnerNode | null;
  __r: ShadowRoot | HTMLElement | undefined;
  __c: Node[] | undefined;
  __u: boolean;
  __b: boolean | undefined;
  __i: ElementInternals | undefined;
  __f: Setter<boolean> | undefined;
  $def: string | null;
  formDisabled: Accessor<boolean>;
  [key: string]: unknown;
}

/** Runs a component body with `__b` set, which makes prop getters warn about reads that never update. */
function inBody<T>(self: Host, draw: () => T): T {
  self.__b = true;
  const outer = swapUntracked(0);
  try {
    return draw();
  } finally {
    swapUntracked(outer);
    self.__b = false;
  }
}

/** Wraps a prop getter to warn once per mount when the component body reads it outside a reactive context. */
function guardProp(self: Host, tag: string, k: string): Accessor<unknown> {
  const read = self.__p[k]!;
  return () => {
    if (self.__b && !isDeliberate()) {
      self.__b = false;
      warn(
        `Prop "${k}" of <${tag}> was read in the component body, outside JSX, createMemo and createEffect, so it never updates. ` +
          'Read it where it is used, or wrap the read in untrack() when the first value is intended.',
      );
    }
    return read();
  };
}

/**
 * Defines a custom element whose shadow root (or light DOM) renders `render(props, host, emit)`
 * once per connection. `schema` lists observed props and their attribute coercion; `options.events`
 * declares the events `emit` may dispatch on the host.
 * Defining an already defined tag swaps its render and re-renders connected instances, which is
 * how hot module replacement updates components; the schema and options stay as first defined.
 * A tag defined by another copy of this library or by plain `customElements.define` keeps that
 * definition, and development builds warn about it.
 */
export function defineComponent<P extends object = {}, X extends EventDecls = {}>(
  tag: string,
  render: (props: ReactiveProps<P>, host: HTMLElement, emit: Emit<X>) => JSX.Element,
  schema: NoInfer<Schema<P>> = {},
  options: ComponentOptions<X> = {},
): ComponentClass<P, X> {
  if (typeof customElements === 'undefined') return class {} as unknown as ComponentClass<P, X>;
  const existing = customElements.get(tag);
  if (existing) {
    if (process.env.NODE_ENV !== 'production' && !updates.has(existing)) {
      warn(
        `<${tag}> is already defined by another copy of @surgijs/core or by a non-Surgi element, so this definition is ignored. ` +
          'Two versions of the library on one page share no component registry: load a single copy.',
      );
    }
    updates.get(existing)?.(render);
    return existing as unknown as ComponentClass<P, X>;
  }

  const types = schema as Record<string, PropType>;
  const keys = Object.keys(types);
  const attrs = keys.map(kebab);
  const byAttr: Record<string, string> = {};
  keys.forEach((k, i) => (byAttr[attrs[i]!] = k));
  const opt = options.shadow ?? true;
  const shadow = opt === true ? { mode: 'open' as const } : opt;
  const closed = shadow && shadow.mode === 'closed';
  const form = !!options.form;
  const light = !shadow && !('children' in types);
  const events = options.events as EventDecls | undefined;
  const css = shadow && options.styles ? ([] as string[]).concat(options.styles) : null;
  // replaceSync drops @import rules, so such CSS keeps a <style> element.
  const adopt = typeof CSSStyleSheet != 'undefined' && 'replaceSync' in CSSStyleSheet.prototype && !css?.some((c) => /@imp/i.test(c));
  let sheets: CSSStyleSheet[] | undefined;
  const hosts = new Set<HTMLElement>();
  let current = render;

  const mount = (el: HTMLElement, root: Node, owner: OwnerNode | null, hydrated: boolean): void => {
    const self = el as unknown as Host;
    self.__o = owner;
    hosts.add(el);
    const emit = ((name: string, detail?: unknown) =>
      el.dispatchEvent(new CustomEvent(name, { bubbles: true, composed: true, ...events?.[name], detail }))) as unknown as Emit<X>;
    createRoot((dispose) => {
      self.__d = dispose;
      deferMount(() => {
        // Fallback <style> elements share the root, so the render must not own all of it.
        const shared = css && !adopt;
        const draw = () => (devRender ? devRender(el, current, self.__p, emit) : current(self.__p as ReactiveProps<P>, el, emit));
        insert(
          root,
          process.env.NODE_ENV !== 'production' ? inBody(self, draw) : draw(),
          shared ? null : undefined,
          shared && hydrated ? Array.from(root.childNodes) : undefined,
        );
      });
    }, owner);
  };

  const appendFallbackStyles = (root: ParentNode): void => {
    if (css && !adopt) root.append(...css.map((text) => Object.assign(document.createElement('style'), { textContent: text })));
  };

  const unmount = (self: Host): void => {
    const root = self.__r!;
    if (closed) undelegateRoot(root);
    try {
      self.__d?.();
      devUnmount?.(self);
    } finally {
      self.__d = undefined;
      self.__o = null;
      hosts.delete(self);
      root.replaceChildren();
    }
  };

  class Element extends HTMLElement {
    static observedAttributes = attrs;
    static formAssociated = form;

    constructor() {
      super();
      const self = this as unknown as Host;
      self.__s = {};
      self.__p = {};
      for (const k of keys) self.__p[k] = (self.__s[k] = createSignal<unknown>())[0];
      if (process.env.NODE_ENV !== 'production') for (const k of keys) self.__p[k] = guardProp(self, tag, k);
      if (light) self.__p.children = () => self.__c;
      if (form) {
        self.__i = this.attachInternals();
        [self.formDisabled, self.__f] = createSignal(false);
      }
    }

    attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
      const k = byAttr[name];
      if (k) (this as unknown as Host).__s[k]![1](() => coerce(types[k], value));
    }

    connectedCallback(): void {
      const self = this as unknown as Host;
      if (self.__d) return;
      if (!self.__u) {
        self.__u = true;
        for (const k of keys) {
          if (Object.hasOwn(this, k)) {
            const v = self[k];
            delete self[k];
            self[k] = v;
          }
        }
        if (form) self.$def = this.getAttribute('value');
      }
      const root = (self.__r ||= shadow ? this.shadowRoot || this.attachShadow(shadow) : this);
      if (closed) delegateRoot(root);
      if (css) {
        // Server markup carries its own copy of the CSS so it paints before upgrade.
        root.querySelectorAll('style[data-s]').forEach((el) => el.remove());
        if (adopt) (root as ShadowRoot).adoptedStyleSheets = sheets ||= css.map(makeSheet);
      }
      const end = hydrateRoot ? hydrateRoot(root) : null;
      if (!end) {
        if (light && !self.__c) self.__c = Array.from(this.childNodes);
        root.replaceChildren();
      }
      try {
        mount(this, root, getOwner(), !!end);
      } finally {
        if (end) end();
      }
      appendFallbackStyles(root);
    }

    disconnectedCallback(): void {
      queueMicrotask(() => {
        const self = this as unknown as Host;
        if (self.__d && !this.isConnected) unmount(self);
      });
    }

    setFormValue(value: File | string | FormData | null): void {
      (this as unknown as Host).__i?.setFormValue(value);
    }

    setFormValidity(flags?: ValidityStateFlags, message?: string, anchor?: HTMLElement): void {
      (this as unknown as Host).__i?.setValidity(flags, message, anchor);
    }

    formDisabledCallback(disabled: boolean): void {
      (this as unknown as Host).__f?.(disabled);
    }

    formResetCallback(): void {
      const self = this as unknown as Host;
      const v = self.$def;
      if ('value' in types) self.value = coerce(types.value, v);
      else this.setFormValue(v);
    }
  }

  for (const k of keys) {
    const type = types[k];
    const reflect = type === String || type === Number || type === Boolean;
    const name = kebab(k);
    Object.defineProperty(Element.prototype, k, {
      configurable: true,
      enumerable: true,
      get(this: Host) {
        return this.__s[k]![0]();
      },
      set(this: Host, v: unknown) {
        this.__s[k]![1](() => v);
        if (reflect) {
          if (v == null || v === false) this.removeAttribute(name);
          else this.setAttribute(name, v === true ? '' : '' + (v as string));
        }
        if (form && k === 'value') this.__i?.setFormValue(v == null ? null : '' + (v as string));
      },
    });
  }

  updates.set(Element, (next) => {
    current = next as typeof render;
    for (const el of [...hosts]) {
      const self = el as unknown as Host;
      if (!self.__d) continue;
      if (el.isConnected) {
        self.__d();
        devUnmount?.(el);
      }
      if (!el.isConnected) {
        unmount(self);
        continue;
      }
      self.__r!.replaceChildren();
      mount(el, self.__r!, self.__o, false);
      appendFallbackStyles(self.__r!);
    }
  });
  customElements.define(tag, Element);
  return Element as unknown as ComponentClass<P, X>;
}
