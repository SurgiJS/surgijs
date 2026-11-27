import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, flush } from '@surgijs/core';
import { disableHydration, enableHydration } from '@surgijs/core/hydrate';
import { attrPart, escape, renderToStream, renderToString, shadowHTML } from '@surgijs/core/server';
import { Counter } from '../../../apps/playground/src/counter.tsx';
import * as server from '../../../apps/playground/src/counter.tsx?ssr';
import * as app from './fixtures/ssr-app.tsx?ssr';
import * as dom from './fixtures/ssr-app.tsx';

const ServerCounter = server.Counter!;

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

  it('renders the fallback of an error boundary and nothing for a portal', () => {
    expect(render('Guarded')).toBe('<x-guarded><template shadowrootmode="open"><p>failed</p></template></x-guarded>');
    expect(render('Portaled')).toBe('<x-portaled><template shadowrootmode="open"><div></div></template></x-portaled>');
  });

  it('projects children and escapes text at every level', () => {
    expect(render('Page', { title: 'A & B' })).toBe(
      '<x-page title="A &amp; B"><template shadowrootmode="open"><main><section><h2>A &amp; B</h2><b class="badge">A &amp; B</b><!----><em>A &amp; B</em></section><!----><p class="dark">themed</p><!----><div><i>shown</i><!----><ul><li>x</li><li>&lt;y&gt;</li></ul><span>B</span></div></main></template></x-page>',
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

  it('works as a Web Response body', async () => {
    const response = new Response(renderToStream('x-deferred', tree.Deferred as never), { headers: { 'content-type': 'text/html' } });
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
