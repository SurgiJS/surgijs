import { afterEach, describe, expect, it } from 'vitest';
import { flush } from '@surgijs/core';
import { personAt } from '../../../apps/playground/src/virtual-table.tsx';
import '../../../apps/playground/src/virtual-tiles.tsx';

function mount(tag: string, attrs: Record<string, string>) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  document.body.appendChild(el);
  flush();
  const root = el.shadowRoot!;
  const scroller = root.querySelector<HTMLElement>('.scroller')!;
  let top = 0;
  Object.defineProperty(scroller, 'scrollTop', {
    configurable: true,
    get: () => top,
    set: (v: number) => (top = v),
  });
  const scroll = (to: number) => {
    top = to;
    scroller.dispatchEvent(new Event('scroll'));
    flush();
  };
  return { el, root, scroller, scroll };
}

afterEach(() => document.body.replaceChildren());

describe('ui-virtual-table', () => {
  const setup = () => {
    const t = mount('ui-virtual-table', { rows: '1000', height: '480' });
    const rows = () => Array.from(t.root.querySelectorAll<HTMLElement>('.row.body'));
    const shown = () => rows().map((r) => Number(r.getAttribute('aria-rowindex')) - 2);
    const key = (k: string) => {
      t.scroller.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, composed: true }));
      flush();
    };
    return { ...t, rows, shown, key };
  };

  it('renders only the rows that fit the viewport plus the overscan', () => {
    const { rows, shown, root } = setup();
    // 480 px / 32 px rows = 15, plus a partial row, plus 4 above and 4 below.
    expect(rows()).toHaveLength(24);
    expect(shown()).toEqual(Array.from({ length: 24 }, (_, i) => i));
    expect(root.querySelector('.spacer')!.getAttribute('style')).toContain('height: 32000px');
    const first = rows()[0]!.querySelectorAll('span');
    expect(first[1]!.textContent).toBe(personAt(0).name);
    expect(root.querySelector('.footer')!.textContent).toContain('24 of 1,000 rows in the DOM');
  });

  it('reuses row elements and rewrites one row per row scrolled', () => {
    const { rows, shown, scroll } = setup();
    scroll(32 + 32 * 10);
    const before = rows();
    const indexes = shown();
    expect(Math.min(...indexes)).toBe(6);
    expect(Math.max(...indexes)).toBe(29);

    scroll(32 + 32 * 11);
    const after = rows();
    expect(after).toEqual(before);
    const changed = shown().filter((i, k) => i !== indexes[k]);
    expect(changed).toEqual([30]);
    const row = after.find((r) => r.getAttribute('aria-rowindex') === '32')!;
    expect(row.style.transform).toBe('translateY(960px)');
    expect(row.querySelectorAll('span')[2]!.textContent).toBe(personAt(30).email);
  });

  it('selects with the keyboard and scrolls the selection into view', () => {
    const { scroller, shown, key, root } = setup();
    key('ArrowDown');
    expect(root.querySelector('.selected')!.getAttribute('aria-rowindex')).toBe('2');
    key('End');
    expect(scroller.scrollTop).toBe(999 * 32 + 32 - 448);
    expect(shown()).toContain(999);
    const selected = root.querySelectorAll('.selected');
    expect(selected).toHaveLength(1);
    expect(selected[0]!.getAttribute('aria-rowindex')).toBe('1001');
    expect(root.querySelector('.footer')!.textContent).toContain('selected: #1,000');
    key('Home');
    expect(scroller.scrollTop).toBe(0);
    expect(root.querySelector('.selected')!.getAttribute('aria-rowindex')).toBe('2');
  });
});

describe('ui-tile-grid', () => {
  const tiles = (root: ShadowRoot) => Array.from(root.querySelectorAll<HTMLElement>('.tile'));

  it('lays tiles out in columns and hides the slots past the end', () => {
    const { root } = mount('ui-tile-grid', { count: '10', height: '480' });
    // happy-dom has no layout, so the grid falls back to 800 px: 7 columns of 104 px.
    expect(root.querySelector('.footer')!.textContent).toContain('7 columns');
    const all = tiles(root);
    expect(all).toHaveLength(14);
    expect(all.filter((t) => t.hidden)).toHaveLength(4);
    expect(all[8]!.querySelector('b')!.textContent).toBe('9');
    expect(all[8]!.style.transform).toBe('translate(144px, 112px)');
  });

  it('rewrites one row of tiles per row scrolled', () => {
    const { root, scroll } = mount('ui-tile-grid', { count: '100000', height: '480' });
    const before = tiles(root);
    // ceil(480 / 104) + 1 + 2 × 4 = 14 rows of 7 tiles.
    expect(before).toHaveLength(98);
    const label = () => tiles(root).map((t) => t.querySelector('b')!.textContent);
    scroll(8 + 104 * 10);
    const labels = label();
    scroll(8 + 104 * 11);
    expect(tiles(root)).toEqual(before);
    const changed = label().filter((l, k) => l !== labels[k]);
    expect(changed).toEqual(['141', '142', '143', '144', '145', '146', '147']);
  });
});
