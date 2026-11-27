import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, flush } from '@surgijs/core';
import { disableHydration, enableHydration } from '@surgijs/core/hydrate';
import { attrPart, escape, renderToString, shadowHTML } from '@surgijs/core/server';
import { Counter } from '../../../apps/playground/src/counter.tsx';
import * as server from '../../../apps/playground/src/counter.tsx?ssr';

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
