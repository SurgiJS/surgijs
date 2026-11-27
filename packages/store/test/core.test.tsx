// @vitest-environment happy-dom
import { createRoot, createEffect } from '@surgijs/core';
import { describe, expect, it } from 'vitest';
import { createStore, remote } from '@surgijs/store';
import { fromStatus, fromStore } from '@surgijs/store/core';

describe('core signal adapter', () => {
  it('exposes selectors as signals and unsubscribes with the owner', async () => {
    const store = createStore({ count: 1 });
    let dispose!: () => void;
    const count = createRoot((d) => {
      dispose = d;
      return fromStore(store, (s) => s.count);
    });
    expect(count()).toBe(1);
    store.set('count', 2);
    expect(count()).toBe(2);
    dispose();
    store.set('count', 3);
    expect(count()).toBe(2);
  });

  it('keeps remotes loaded and reports status', async () => {
    const store = createStore({
      list: remote({ deps: () => '/x', fetch: async () => [1, 2], retry: false }),
    });
    let dispose!: () => void;
    const seen: unknown[] = [];
    createRoot((d) => {
      dispose = d;
      const list = fromStore(store, (s) => s.list);
      const status = fromStatus(store, 'list');
      createEffect(() => void seen.push([list(), status().status]));
    });
    await new Promise((r) => setTimeout(r, 10));
    expect(seen.at(-1)).toEqual([[1, 2], 'success']);
    expect(store.status('list').isActive).toBe(true);
    dispose();
    expect(store.status('list').isActive).toBe(false);
  });
});
