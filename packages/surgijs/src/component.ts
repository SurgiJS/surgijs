import { devRender, devUnmount } from './dev';
import { delegateRoot, insert, undelegateRoot } from './dom';
import { createRoot, createSignal, deferMount, getOwner, type Accessor, type OwnerNode, type Setter } from './reactivity';
import type { JSX } from './jsx-runtime';

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

export interface ComponentOptions {
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
}

export interface FormHost extends HTMLElement {
  setFormValue(value: File | string | FormData | null): void;
  setFormValidity(flags?: ValidityStateFlags, message?: string, anchor?: HTMLElement): void;
  formDisabled: Accessor<boolean>;
}

export interface ComponentClass<P> {
  new (): HTMLElement & P;
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
  __i: ElementInternals | undefined;
  __f: Setter<boolean> | undefined;
  $def: string | null;
  formDisabled: Accessor<boolean>;
  [key: string]: unknown;
}

/**
 * Defines a custom element whose shadow root (or light DOM) renders `render(props, host)`
 * once per connection. `schema` lists observed props and their attribute coercion.
 * Defining an already defined tag swaps its render and re-renders connected instances, which is
 * how hot module replacement updates components; the schema and options stay as first defined.
 */
export function defineComponent<P extends object = {}>(
  tag: string,
  render: (props: ReactiveProps<P>, host: HTMLElement) => JSX.Element,
  schema: NoInfer<Schema<P>> = {},
  options: ComponentOptions = {},
): ComponentClass<P> {
  if (typeof customElements === 'undefined') return class {} as unknown as ComponentClass<P>;
  const existing = customElements.get(tag);
  if (existing) {
    updates.get(existing)?.(render);
    return existing as unknown as ComponentClass<P>;
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
    createRoot((dispose) => {
      self.__d = dispose;
      deferMount(() => {
        // Fallback <style> elements share the root, so the render must not own all of it.
        const shared = css && !adopt;
        insert(
          root,
          devRender ? devRender(el, current, self.__p) : current(self.__p as ReactiveProps<P>, el),
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
  return Element as unknown as ComponentClass<P>;
}
