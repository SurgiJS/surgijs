import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, flush } from '@surgijs/core';
import { disableHydration, enableHydration } from '@surgijs/core/hydrate';
import { attrPart, escape, escapeRaw, renderToStream, renderToString, shadowHTML } from '@surgijs/core/server';
import { Counter } from '../../../apps/playground/src/counter.tsx';
import * as server from '../../../apps/playground/src/counter.tsx?ssr';
import * as app from './fixtures/ssr-app.tsx?ssr';
import * as dom from './fixtures/ssr-app.tsx';

const ServerCounter = server.Counter!;

const renderApp = (view: string) =>
  renderToString(`x-${view.toLowerCase()}`, (app as unknown as Record<string, (props: Record<string, () => unknown>) => unknown>)[view]!);

const CARD = '<div class="card"><h3>Counter</h3><p>Value: 0</p><button>Add</button></div>';

afterEach(() => {
  disableHydration();
  document.body.replaceChildren();
});

function serverRendered(tag: string): HTMLElement {
  const el = document.createElement(tag);
  el.attachShadow({ mode: 'open' }).innerHTML = CARD;
  document.body.appendChild(el);
  return el;
}

describe('server helpers', () => {
  it('escapes text and attributes', () => {
    expect(escape('<a href="x">&</a>')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;');
    expect(escape(null)).toBe('');
    expect(escape(false)).toBe('');
    expect(escape(0)).toBe('0');
    expect(attrPart('class', 'a"b')).toBe(' class="a&quot;b"');
    expect(attrPart('hidden', true)).toBe(' hidden');
    expect(attrPart('hidden', false)).toBe('');
    expect(shadowHTML('x-a', '<b></b>', { maxItems: 2 })).toBe('<x-a max-items="2"><template shadowrootmode="open"><b></b></template></x-a>');
    expect(shadowHTML('x-a', '<slot></slot>', {}, { children: 'Save', delegatesFocus: true })).toBe(
      '<x-a><template shadowrootmode="open" shadowrootdelegatesfocus><slot></slot></template>Save</x-a>',
    );
  });

  it('keeps raw text elements literal and renders styles unescaped', () => {
    expect(escapeRaw('a > b & "c"</STYLE>', 'style')).toBe('a > b & "c"<\\/STYLE>');
    expect(escapeRaw(null, 'style')).toBe('');
    expect(escapeRaw(['<', '/style><img>'], 'style')).toBe('<\\/style><img>');
    expect(escapeRaw(['</sty', 'le>'], 'style')).toBe('<\\/style>');
    expect(escapeRaw('{"t":"<!--<script>"}</script>', 'script')).toBe('{"t":"<!--\\u003cscript>"}<\\/script>');
    expect(escapeRaw('for(i=0;i<scripts.length;i++)if(a<!--b)x</scripts>', 'script')).toBe('for(i=0;i<scripts.length;i++)if(a<!--b)x</scripts>');
    expect(JSON.parse(escapeRaw('{"t":"<!--<script>"}', 'script'))).toEqual({ t: '<!--<script>' });
    expect(escapeRaw('<!--', 'style')).toBe('<!--');
    expect(shadowHTML('x-a', '<b></b>', {}, { styles: ['a > b { color: red }', 'i { x: "&" }'] })).toBe(
      '<x-a><template shadowrootmode="open"><style data-s>a > b { color: red }</style><style data-s>i { x: "&" }</style><b></b></template></x-a>',
    );
  });

  it('renders a compiled component into declarative shadow DOM', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(renderToString('my-counter', ServerCounter)).toBe(`<my-counter><template shadowrootmode="open">${CARD}</template></my-counter>`);
    expect(renderToString('my-counter', ServerCounter, { title: 'A & B', step: 2 })).toBe(
      '<my-counter title="A &amp; B" step="2"><template shadowrootmode="open"><div class="card"><h3>A &amp; B</h3><p>Value: 0</p><button>Add</button></div></template></my-counter>',
    );
    log.mockRestore();
  });
});

describe('nested components on the server', () => {
  const tree = app as unknown as Record<string, (props: Record<string, () => unknown>) => unknown>;
  const render = (view: string, props: Record<string, unknown> = {}) =>
    renderToString(`x-${view.toLowerCase()}`, tree[view] as never, props);

  it('renders child components with their props', () => {
    expect(render('Badge', { label: 'A & B' })).toBe(
      '<x-badge label="A &amp; B"><template shadowrootmode="open"><b class="badge">A &amp; B</b></template></x-badge>',
    );
    expect(render('Panel', { title: 'T' })).toBe(
      '<x-panel title="T"><template shadowrootmode="open"><section><h2>T</h2><b class="badge">T</b><!----></section></template></x-panel>',
    );
  });

  it('reads context from the nearest provider and falls back to the default', () => {
    expect(render('Themed')).toBe('<x-themed><template shadowrootmode="open"><p class="light">themed</p></template></x-themed>');
    expect(render('Page', { title: 'A & B' })).toContain('<p class="dark">themed</p>');
  });

  it('renders control flow on the server', () => {
    expect(render('List', { items: ['x', '<y>'], mode: 'b', show: true })).toBe(
      '<x-list items="[&quot;x&quot;,&quot;&lt;y&gt;&quot;]" mode="b" show><template shadowrootmode="open"><div><i>shown</i><!----><ul><li>x</li><li>&lt;y&gt;</li></ul><span>B</span></div></template></x-list>',
    );
    expect(render('List', { mode: 'z' })).toBe(
      '<x-list mode="z"><template shadowrootmode="open"><div><!----><ul></ul><em>other</em></div></template></x-list>',
    );
  });

  it('passes the value to function children and the index to rows', () => {
    expect(render('Users', { user: { name: 'Ann & Co' }, names: ['a', 'b'] })).toBe(
      '<x-users user="{&quot;name&quot;:&quot;Ann &amp; Co&quot;}" names="[&quot;a&quot;,&quot;b&quot;]"><template shadowrootmode="open"><div><b>Ann &amp; Co</b><!----><ol><li>0<!---->:a</li><li>1<!---->:b</li></ol></div></template></x-users>',
    );
  });

  it('keeps the markup of a fragment inside a component before the next sibling', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const html = renderToString('x-nested', app.Nested as never);
    const el = document.createElement('x-nested');
    el.attachShadow({ mode: 'open' }).innerHTML = html.replace(/^<[^>]*><template shadowrootmode="open">/, '').replace(/<\/template>.*$/, '');
    document.body.appendChild(el);
    const button = el.shadowRoot!.querySelector('button');
    enableHydration();
    defineComponent('x-nested', dom.Nested, {});
    expect(el.shadowRoot!.innerHTML).toBe('<div>x<i>inside</i><!----><button>Save</button></div>');
    expect(el.shadowRoot!.querySelector('button')).toBe(button);
    disableHydration();
    log.mockRestore();
  });

  it('renders the fallback of an error boundary and nothing for a portal', () => {
    expect(render('Guarded')).toBe('<x-guarded><template shadowrootmode="open"><p>failed</p></template></x-guarded>');
    expect(render('Portaled')).toBe('<x-portaled><template shadowrootmode="open"><div></div></template></x-portaled>');
  });

  it('projects children and escapes text at every level', () => {
    expect(render('Page', { title: 'A & B' })).toBe(
      '<x-page title="A &amp; B"><template shadowrootmode="open"><main><section><h2>A &amp; B</h2><b class="badge">A &amp; B</b><!----><em>A &amp; B</em></section><!----><p class="dark">themed</p><!----><div><i>shown</i><!----><ul><li>x</li><li>&lt;y&gt;</li></ul><span>B</span></div></main></template></x-page>',
    );
  });

  it('escapes values that rows and branches return', () => {
    expect(render('Items', { items: ['<b>'] })).toBe(
      '<x-items items="[&quot;&lt;b&gt;&quot;]"><template shadowrootmode="open"><div><b>Items</b>&lt;b&gt;</div></template></x-items>',
    );
  });

  it('rejects async values in renderToString', () => {
    expect(() => render('Deferred')).toThrow(/renderToStream/);
  });
});

describe('streaming', () => {
  const tree = app as unknown as Record<string, (props: Record<string, () => unknown>) => unknown>;

  async function collect(stream: ReadableStream<string>): Promise<string[]> {
    const chunks: string[] = [];
    for await (const chunk of stream) chunks.push(chunk);
    return chunks;
  }

  it('streams the same markup as renderToString when nothing is async', async () => {
    const props = { title: 'A & B' };
    const chunks = await collect(renderToStream('x-page', tree.Page as never, props));
    expect(chunks.join('')).toBe(renderToString('x-page', tree.Page as never, props));
  });

  it('sends the markup before an async component resolves', async () => {
    const chunks = await collect(renderToStream('x-deferred', tree.Deferred as never));
    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks[0]).toBe('<x-deferred><template shadowrootmode="open">');
    expect(chunks[1]).toBe('<section>');
    expect(chunks.join('')).toBe('<x-deferred><template shadowrootmode="open"><section><q>soon</q></section></template></x-deferred>');
  });

  it('waits for a promise in a text hole', async () => {
    const chunks = await collect(renderToStream('x-await', tree.Await as never, { value: Promise.resolve('a & b') }));
    expect(chunks.join('')).toContain('<template shadowrootmode="open"><p>a &amp; b</p></template></x-await>');
  });

  it('replaces the whole boundary when an async child rejects', async () => {
    const chunks = await collect(renderToStream('x-mixed', app.MixedGuard as never));
    expect(chunks.join('')).toBe('<x-mixed><template shadowrootmode="open"><div><p>failed</p></div></template></x-mixed>');
  });

  it('runs cleanups of a component that throws inside an error boundary', () => {
    const fixture = app as unknown as { cleaned: string[] };
    fixture.cleaned.length = 0;
    expect(renderApp('ThrowsBoundary')).toContain('<p>caught</p>');
    expect(fixture.cleaned).toEqual(['done']);
  });

  it('escapes strings returned by children, components and fallbacks', () => {
    const out = renderApp('Unsafe');
    expect(out).toContain('&lt;i&gt;show&lt;/i&gt;');
    expect(out).toContain('&lt;u&gt;row&lt;/u&gt;');
    expect(out).toContain('&lt;b&gt;fallback&lt;/b&gt;');
    expect(out).not.toMatch(/<[iubs]>/);
    expect(renderApp('StrHost')).toContain('&lt;em&gt;str&lt;/em&gt;');
    expect(renderApp('GuardedStr')).toContain('&lt;r&gt;child&lt;/r&gt;');
  });

  it('escapes strings returned by async components when streamed', async () => {
    const chunks = await collect(renderToStream('x-async-str', app.AsyncStrHost as never));
    expect(chunks.join('')).toContain('&lt;s&gt;async&lt;/s&gt;');
  });

  it('collects match cases inside a fragment child', () => {
    expect(renderApp('FragSwitch')).toContain('<b>yes</b>');
  });

  it('renders the fallback when an async child rejects', async () => {
    const chunks = await collect(renderToStream('x-guarded', tree.AsyncGuarded as never));
    expect(chunks.join('')).toBe('<x-guarded><template shadowrootmode="open"><div><p>failed</p></div></template></x-guarded>');
  });

  it('starts sibling async components before the first one resolves', async () => {
    const fixture = app as unknown as { started: string[]; gate: { open: () => void } };
    fixture.started.length = 0;
    const reader = renderToStream('x-pair', tree.Pair as never).getReader();
    const chunks: string[] = [];
    for (let i = 0; i < 2; i++) chunks.push((await reader.read()).value!);
    expect(fixture.started).toEqual(['a', 'b']);
    fixture.gate.open();
    for (let next = await reader.read(); !next.done; next = await reader.read()) chunks.push(next.value);
    expect(chunks.join('')).toBe('<x-pair><template shadowrootmode="open"><section><q>a</q><!----><q>b</q></section></template></x-pair>');
  });

  it('starts async siblings nested in a deeper element before a later sibling resolves', async () => {
    const fixture = app as unknown as { started: string[]; gate: { open: () => void } };
    fixture.started.length = 0;
    const reader = renderToStream('x-nested-siblings', app.NestedSiblings as never).getReader();
    await reader.read();
    await reader.read();
    expect([...fixture.started].sort()).toEqual(['a', 'b']);
    fixture.gate.open();
    for (let next = await reader.read(); !next.done; next = await reader.read());
  });

  it('works as a Web Response body', async () => {
    const stream = renderToStream('x-deferred', tree.Deferred as never).pipeThrough(new TextEncoderStream());
    const response = new Response(stream, { headers: { 'content-type': 'text/html' } });
    expect(await response.text()).toBe('<x-deferred><template shadowrootmode="open"><section><q>soon</q></section></template></x-deferred>');
  });
});

describe('hydration', () => {
  it('adopts server nodes and keeps them across updates', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const el = serverRendered('ssr-counter');
    const root = el.shadowRoot!;
    const card = root.firstChild!;
    const button = root.querySelector('button')!;
    enableHydration();
    defineComponent('ssr-counter', Counter, { step: Number, title: String });
    expect(root.firstChild).toBe(card);
    expect(root.querySelector('button')).toBe(button);
    const p = root.querySelector('p')!;
    expect(Array.from(p.childNodes).map((n) => n.textContent)).toEqual(['Value: ', '0']);
    const value = p.lastChild;
    button.click();
    flush();
    expect(root.firstChild).toBe(card);
    expect(p.lastChild).toBe(value);
    expect(p.textContent).toBe('Value: 1');
    expect(root.innerHTML).toBe('<div class="card"><h3>Counter</h3><p>Value: 1</p><button>Add</button></div>');
    log.mockRestore();
  });

  it('replaces server content of control flow instead of duplicating it', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const html = renderToString('x-list-hyd', app.List as never, { items: ['x'] });
    const el = document.createElement('x-list-hyd');
    el.attachShadow({ mode: 'open' }).innerHTML = html.replace(/^<[^>]*><template shadowrootmode="open">/, '').replace(/<\/template>.*$/, '');
    document.body.appendChild(el);
    enableHydration();
    defineComponent('x-list-hyd', dom.List, { items: Array, mode: String, show: Boolean });
    el.setAttribute('items', '["x"]');
    flush();
    expect(el.shadowRoot!.innerHTML).toBe('<div><!----><ul><li>x</li></ul><em>other</em></div>');
    log.mockRestore();
  });

  it('does not duplicate text that an array-valued region renders', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const html = renderToString('x-items-hyd', app.Items as never, { items: ['a'] });
    const el = document.createElement('x-items-hyd');
    el.attachShadow({ mode: 'open' }).innerHTML = html.replace(/^<[^>]*><template shadowrootmode="open">/, '').replace(/<\/template>.*$/, '');
    document.body.appendChild(el);
    enableHydration();
    defineComponent('x-items-hyd', dom.Items, { items: Array });
    el.setAttribute('items', '["a"]');
    flush();
    expect(el.shadowRoot!.innerHTML).toBe('<div><b>Items</b>a</div>');
    disableHydration();
    log.mockRestore();
  });

  it('replaces a prefilled shadow root without enableHydration', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const el = serverRendered('csr-counter');
    const card = el.shadowRoot!.firstChild;
    defineComponent('csr-counter', Counter, { step: Number, title: String });
    expect(el.shadowRoot!.firstChild).not.toBe(card);
    expect(el.shadowRoot!.innerHTML).toBe(CARD);
    log.mockRestore();
  });
});
