import { defineComponent, For, useMemo, useState, type ReactiveProps } from '@surgijs/core';
import { createVirtualWindow } from './virtual';

export interface VirtualTableProps {
  /** Number of rows. Default 100 000. */
  rows?: number;
  /** Height of the scrolling area in pixels, header included. Default 480. */
  height?: number;
}

export interface Person {
  id: number;
  name: string;
  email: string;
  city: string;
  amount: string;
  status: 'active' | 'paused' | 'closed';
}

const ROW = 32;
const FIRST = ['Ada', 'Alan', 'Grace', 'Linus', 'Margaret', 'Dennis', 'Barbara', 'Ken', 'Radia', 'Edsger', 'Frances', 'John'];
const LAST = ['Lovelace', 'Turing', 'Hopper', 'Torvalds', 'Hamilton', 'Ritchie', 'Liskov', 'Thompson', 'Perlman', 'Dijkstra', 'Allen', 'Backus'];
const CITIES = ['Berlin', 'Kyiv', 'Lisbon', 'Oslo', 'Tokyo', 'Toronto', 'Austin', 'Nairobi', 'Seoul', 'Lima'];
const STATUS = ['active', 'paused', 'closed'] as const;

/** Row `i` computed from its index, so a million rows cost no memory. */
export function personAt(i: number): Person {
  const h = Math.imul(i + 1, 2654435761) >>> 0;
  const first = FIRST[h % FIRST.length]!;
  const last = LAST[(h >>> 8) % LAST.length]!;
  return {
    id: i + 1,
    name: `${first} ${last}`,
    email: `${first}.${last}.${i + 1}@example.com`.toLowerCase(),
    city: CITIES[(h >>> 16) % CITIES.length]!,
    amount: ((h % 10_000_000) / 100).toFixed(2),
    status: STATUS[(h >>> 4) % STATUS.length]!,
  };
}

const css = `
  :host { display: block; font: 14px/1.4 system-ui, sans-serif; color: #1c1f26; }
  .table { border: 1px solid #d5d9e0; border-radius: 8px; overflow: hidden; background: #fff; }
  .scroller { overflow-y: auto; outline: none; overscroll-behavior: contain; }
  .scroller:focus-visible { box-shadow: inset 0 0 0 2px #4f7cff; }
  .row { display: grid; grid-template-columns: 5rem minmax(8rem, 1.2fr) minmax(10rem, 1.8fr) minmax(5rem, 1fr) 7rem 5rem; gap: .75rem; align-items: center; height: ${ROW}px; padding: 0 .75rem; box-sizing: border-box; }
  .row > span { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .head { position: sticky; top: 0; z-index: 1; background: #f4f6fa; font-weight: 600; border-bottom: 1px solid #d5d9e0; }
  .body { position: absolute; top: 0; left: 0; right: 0; border-bottom: 1px solid #eef0f4; cursor: pointer; }
  .body:hover { background: #f8f9fc; }
  .body.selected { background: #e6edff; }
  .spacer { position: relative; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .active { color: #1a7f37; }
  .paused { color: #9a6700; }
  .closed { color: #8c959f; }
  .footer { margin: 0; padding: .5rem .75rem; border-top: 1px solid #d5d9e0; color: #5b6270; font-size: 12px; }
`;

/**
 * Table with a fixed pool of row elements. Scrolling reassigns rows to items, so the DOM holds
 * only the rows that fit the viewport plus the overscan, whatever the row count.
 */
export const VirtualTable = (props: ReactiveProps<VirtualTableProps>) => {
  const { rows, height } = props;
  const count = () => rows() ?? 100_000;
  const viewport = () => height() ?? 480;
  const win = createVirtualWindow({ count, size: ROW, viewport, offset: ROW });
  const [selected, setSelected] = useState(-1);
  let scroller: HTMLDivElement | undefined;

  const scrollTo = (top: number) => {
    if (scroller) scroller.scrollTop = top;
    win.setScrollTop(top);
  };

  const select = (i: number) => {
    const n = count();
    if (!n) return;
    const next = Math.max(0, Math.min(n - 1, i));
    setSelected(next);
    const top = next * ROW;
    const view = viewport() - ROW;
    const current = win.scrollTop();
    if (top < current) scrollTo(top);
    else if (top + ROW > current + view) scrollTo(top + ROW - view);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const page = Math.max(1, Math.floor((viewport() - ROW) / ROW) - 1);
    const i = selected();
    switch (e.key) {
      case 'ArrowDown':
        select(i + 1);
        break;
      case 'ArrowUp':
        select(i - 1);
        break;
      case 'PageDown':
        select(i + page);
        break;
      case 'PageUp':
        select(i - page);
        break;
      case 'Home':
        select(0);
        break;
      case 'End':
        select(count() - 1);
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  return (
    <div class="table">
      <style>{css}</style>
      <div
        class="scroller"
        role="grid"
        tabindex="0"
        aria-rowcount={count() + 1}
        aria-colcount={6}
        style={{ height: `${viewport()}px` }}
        ref={(el: HTMLDivElement) => (scroller = el)}
        onScroll={(e: Event) => win.setScrollTop((e.currentTarget as HTMLElement).scrollTop)}
        onKeyDown={onKeyDown}
      >
        <div class="row head" role="row" aria-rowindex={1}>
          <span class="num" role="columnheader">#</span>
          <span role="columnheader">Name</span>
          <span role="columnheader">Email</span>
          <span role="columnheader">City</span>
          <span class="num" role="columnheader">Amount</span>
          <span role="columnheader">Status</span>
        </div>
        <div class="spacer" style={{ height: `${count() * ROW}px` }}>
          <For each={win.slots()}>
            {(k: number) => {
              const index = useMemo(() => win.at(k));
              const person = useMemo(() => personAt(index()));
              return (
                <div
                  class={selected() === index() ? 'row body selected' : 'row body'}
                  role="row"
                  aria-rowindex={index() + 2}
                  aria-selected={selected() === index() ? 'true' : 'false'}
                  style={{ transform: `translateY(${index() * ROW}px)` }}
                  onClick={() => select(index())}
                >
                  <span class="num" role="gridcell">{String(person().id)}</span>
                  <span role="gridcell">{String(person().name)}</span>
                  <span role="gridcell">{String(person().email)}</span>
                  <span role="gridcell">{String(person().city)}</span>
                  <span class="num" role="gridcell">{String(person().amount)}</span>
                  <span class={person().status} role="gridcell">{String(person().status)}</span>
                </div>
              );
            }}
          </For>
        </div>
      </div>
      <p class="footer">
        {String(win.slots().length)} of {count().toLocaleString('en-US')} rows in the DOM · selected:{' '}
        {selected() < 0 ? 'none' : `#${(selected() + 1).toLocaleString('en-US')}`}
      </p>
    </div>
  );
};

export const UiVirtualTable = defineComponent<VirtualTableProps>('ui-virtual-table', VirtualTable, {
  rows: Number,
  height: Number,
});
