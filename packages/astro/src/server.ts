import { attrPart, escape, renderToStream } from '@surgijs/core/server';

type View = Parameters<typeof renderToStream>[1];

interface ComponentMeta {
  tag: string;
  render: View;
  schema?: Record<string, unknown>;
  options?: { shadow?: boolean | ShadowRootInit; styles?: string | string[] };
}

type Props = Record<string, unknown>;

/** `defineComponent` returns a class carrying this when it runs without a DOM. */
const meta = (Component: unknown): ComponentMeta | undefined => {
  const m = (Component as { $surgi?: ComponentMeta } | null)?.$surgi;
  return typeof Component === 'function' && m && typeof m.tag === 'string' && typeof m.render === 'function' ? m : undefined;
};

/** What the element makes of an attribute on the client, so a literal `step="2"` reaches the view as `2`. */
function coerce(type: unknown, v: unknown): unknown {
  if (typeof v !== 'string') return v;
  if (type === Boolean) return v !== 'false';
  if (type === Number) return +v;
  if (type === Object || type === Array) {
    try {
      return JSON.parse(v);
    } catch {
      return undefined;
    }
  }
  return v;
}

function slotMarkup(slots: Record<string, string>): string {
  let out = '';
  for (const name in slots) {
    // `astro-slot` is what Astro looks for to know the slot is rendered in place; it is
    // `display: contents`. A named slot sits in a wrapper that carries the `slot` attribute.
    out +=
      name === 'default'
        ? `<astro-slot>${slots[name]}</astro-slot>`
        : `<div slot="${escape(name)}" style="display:contents"><astro-slot name="${escape(name)}">${slots[name]}</astro-slot></div>`;
  }
  return out;
}

async function collect(stream: ReadableStream<string>): Promise<string> {
  const reader = stream.getReader();
  let html = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return html;
    html += value;
  }
}

function check(Component: unknown): boolean {
  return meta(Component) !== undefined;
}

async function renderToStaticMarkup(
  Component: unknown,
  rawProps: Props,
  slots: Record<string, string> = {},
): Promise<{ html: string }> {
  const { tag, render, schema = {}, options = {} } = meta(Component)!;
  const props: Props = {};
  for (const k in rawProps) {
    const v = rawProps[k];
    if (v !== undefined && typeof v !== 'function' && typeof v !== 'symbol') props[k] = coerce(schema[k], v);
  }

  // A light DOM component has no shadow root to adopt, so its host is left for the client to fill.
  if (options.shadow === false) {
    let attrs = '';
    for (const k in props) attrs += attrPart(k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase()), props[k]);
    return { html: `<${tag}${attrs}></${tag}>` };
  }

  const shadow = typeof options.shadow === 'object' ? options.shadow : undefined;
  const html = await collect(
    renderToStream(tag, render, props, {
      children: slotMarkup(slots),
      ...(shadow?.delegatesFocus ? { delegatesFocus: true } : {}),
      ...(options.styles ? { styles: options.styles } : {}),
    }),
  );
  return { html };
}

export default { check, renderToStaticMarkup, supportsAstroStaticSlot: false };
