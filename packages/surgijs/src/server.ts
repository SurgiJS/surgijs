import { createRoot } from './reactivity';

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };

/** Escapes text and attribute values. `null`, `undefined` and booleans render as `''`. */
export function escape(value: unknown): string {
  if (value == null || typeof value === 'boolean') return '';
  if (Array.isArray(value)) return value.map(escape).join('');
  return ('' + (value as string)).replace(/[&<>"]/g, (c) => ESC[c]!);
}

/** ` name="value"`, ` name` for `true`, `''` for `null`/`false`. */
export function attrPart(name: string, value: unknown): string {
  if (value == null || value === false) return '';
  if (value === true) return ' ' + name;
  return ` ${name}="${escape(typeof value === 'object' ? JSON.stringify(value) : value)}"`;
}

const kebab = (s: string): string => s.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());

/** `<tag a="1"><template shadowrootmode="open">inner</template></tag>`. */
export function shadowHTML(tag: string, inner: string, attrs: Record<string, unknown> = {}): string {
  let a = '';
  for (const k in attrs) a += attrPart(kebab(k), attrs[k]);
  return `<${tag}${a}><template shadowrootmode="open">${inner}</template></${tag}>`;
}

/**
 * Renders a component compiled with `generate: 'ssr'` into its host tag with a declarative
 * shadow root. `props` become getters, like attributes on the client.
 */
export function renderToString<P extends Record<string, unknown>>(
  tag: string,
  view: (props: { [K in keyof P]: () => P[K] }, host?: unknown) => unknown,
  props: P = {} as P,
): string {
  const bag = {} as { [K in keyof P]: () => P[K] };
  for (const k in props) bag[k] = () => props[k];
  let html = '';
  createRoot((dispose) => {
    html = '' + (view(bag) ?? '');
    dispose();
  });
  return shadowHTML(tag, html, props);
}
