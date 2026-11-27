import { createMemo, createSignal, type Accessor } from '@surgijs/core';

export interface WindowOptions {
  /** Number of items. */
  count: Accessor<number>;
  /** Item height in pixels. */
  size: number;
  /** Viewport height in pixels. */
  viewport: Accessor<number>;
  /** Pixels above the first item inside the scroller (a sticky header, padding). */
  offset?: number;
  /** Items kept above and below the viewport. */
  overscan?: number;
}

export interface VirtualWindow {
  /** Slot ids `0..n-1`, `n` being the number of items that fit the viewport plus the overscan. */
  slots: Accessor<number[]>;
  /**
   * Item index shown by slot `k`: the index in the rendered range congruent to `k` modulo the
   * slot count. Scrolling by one item changes the index of one slot; the other slots keep theirs.
   */
  at(k: number): number;
  scrollTop: Accessor<number>;
  setScrollTop(top: number): void;
}

/** Tracks which items of a fixed-size list are rendered for the current scroll position. */
export function createVirtualWindow(options: WindowOptions): VirtualWindow {
  const { count, size, viewport, offset = 0, overscan = 4 } = options;
  const [scrollTop, setScrollTop] = createSignal(0);
  const n = createMemo(() => Math.min(count(), Math.ceil(viewport() / size) + 1 + 2 * overscan));
  const start = createMemo(() => {
    const first = Math.floor(Math.max(0, scrollTop() - offset) / size) - overscan;
    return Math.max(0, Math.min(first, count() - n()));
  });
  const slots = createMemo(() => Array.from({ length: n() }, (_, k) => k));
  return {
    slots,
    at(k) {
      const s = start();
      const m = n();
      return s + ((((k - s) % m) + m) % m);
    },
    scrollTop,
    setScrollTop,
  };
}
