import { cleanup, createMemo, createSignal, getOwner, onCleanup, runOwned, untrack, type Accessor, type OwnerNode, type Setter } from './reactivity';
import type { JSX } from './jsx-runtime';

export interface ForProps<T> {
  each: readonly T[] | null | undefined | Accessor<readonly T[] | null | undefined>;
  /** Row key. Defaults to the item itself; keys must be unique. */
  by?: (item: T, index: number) => unknown;
  children: (item: T, index: Accessor<number>) => JSX.Element;
}

/** A row is its own owner: `v` the rendered view, `i` the index setter. */
interface Row extends OwnerNode {
  v: JSX.Element;
  i: Setter<number> | undefined;
}

/**
 * Keyed list. Each key renders once; rows move with few DOM operations and dispose
 * when their key leaves the list. `index` is a getter.
 */
export function For<T>(props: ForProps<T>): JSX.Element {
  const render = props.children;
  const by = props.by;
  const indexed = render.length > 1;
  let rows = new Map<unknown, Row>();
  let dupes: Row[] = [];

  const clearDupes = () => {
    for (let i = 0; i < dupes.length; i++) cleanup(dupes[i]!);
    dupes = [];
  };

  onCleanup(() => {
    clearDupes();
    for (const row of rows.values()) cleanup(row);
    rows.clear();
  });

  const fill = (row: Row, item: T, index: number): void => {
    let get: Accessor<number> = () => index;
    if (indexed) [get, row.i] = createSignal(index);
    row.v = render(item, get);
  };

  const make = (item: T, index: number, owner: OwnerNode | null): Row => {
    const row: Row = { c: null, b: null, p: owner, k: owner ? owner.k : null, v: undefined, i: undefined };
    runOwned(row, fill, item, index);
    return row;
  };

  return createMemo(() => {
    clearDupes();
    const each = props.each;
    const items = (typeof each === 'function' ? each() : each) || [];
    const next = new Map<unknown, Row>();
    const out: JSX.Element[] = new Array(items.length);
    const owner = getOwner();
    untrack(() => {
      for (let i = 0; i < items.length; i++) {
        const item = items[i]!;
        const key = by ? by(item, i) : item;
        let row = rows.get(key);
        if (row) {
          rows.delete(key);
          if (row.i) row.i(i);
        } else row = make(item, i, owner);
        const prev = next.get(key);
        if (prev) dupes.push(prev);
        next.set(key, row);
        out[i] = row.v;
      }
    });
    for (const row of rows.values()) cleanup(row);
    rows = next;
    return out;
  }) as unknown as JSX.Element;
}
