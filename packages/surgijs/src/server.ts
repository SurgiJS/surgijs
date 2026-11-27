import { createRoot } from './reactivity';

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };

/** Escapes text and attribute values. `null`, `undefined` and booleans render as `''`. */
export function escape(value: unknown): string {
  if (value == null || typeof value === 'boolean') return '';
  if (Array.isArray(value)) return value.map(escape).join('');
  return ('' + (value as string)).replace(/[&<>"]/g, (c) => ESC[c]!);
}

/**
 * Text for raw text elements (`<style>`, `<script>`), where entities are not decoded: only
 * the closing tag is neutralised, so `a > b` and `&` survive as written.
 */
export function escapeRaw(value: unknown, tag: string): string {
  if (value == null || typeof value === 'boolean') return '';
  if (Array.isArray(value)) return value.map((v) => escapeRaw(v, tag)).join('');
  return ('' + (value as string)).replace(new RegExp(`</(${tag})`, 'gi'), '<\\/$1');
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

/** `<tag a="1"><template shadowrootmode="open">inner</template>children</tag>`. */
export function shadowHTML(tag: string, inner: string, attrs: Record<string, unknown> = {}, options: ShadowOptions = {}): string {
  let a = '';
  for (const k in attrs) a += attrPart(kebab(k), attrs[k]);
  const focus = options.delegatesFocus ? ' shadowrootdelegatesfocus' : '';
  const css = ([] as string[]).concat(options.styles ?? []).map((c) => `<style data-s>${escapeRaw(c, 'style')}</style>`);
  return `<${tag}${a}><template shadowrootmode="open"${focus}>${css.join('')}${inner}</template>${options.children ?? ''}</${tag}>`;
}

/**
 * Renders a component compiled with `generate: 'ssr'` into its host tag with a declarative
 * shadow root. `props` become getters, like attributes on the client; `options` adds light
 * DOM children and focus delegation.
 */
export function renderToString<P extends Record<string, unknown>>(
  tag: string,
  view: (props: { [K in keyof P]: () => P[K] }, host?: unknown) => unknown,
  props: P = {} as P,
  options: ShadowOptions = {},
): string {
  const bag = new Proxy({} as { [K in keyof P]: () => P[K] }, {
    get: (_, k) => () => props[k as keyof P],
  });
  let html = '';
  createRoot((dispose) => {
    html = '' + (view(bag) ?? '');
    dispose();
  });
  return shadowHTML(tag, html, props, options);
}
