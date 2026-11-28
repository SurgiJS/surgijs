import { describe, expect, it, vi } from 'vitest';
import { createStore, remote } from '@surgijs/store';
import { fromStatus, fromStore } from '@surgijs/store/svelte';

describe('svelte adapter', () => {
  it('calls the subscriber with the current value and then on change', () => {
    const store = createStore({ count: 1, noise: 0 });
    const count = fromStore(store, (s) => s.count);
    const seen: number[] = [];
    const unsubscribe = count.subscribe((v) => seen.push(v));
    store.set('count', 2);
    store.set('noise', 1);
    store.set('count', 2);
    unsubscribe();
    store.set('count', 3);
    expect(seen).toEqual([1, 2]);
  });

  it('opens one store subscription per subscriber and keeps remotes loaded only while subscribed', async () => {
    let loads = 0;
    const store = createStore({
      list: remote({
        deps: () => '/x',
        fetch: async () => {
          loads++;
          return [1, 2];
        },
        retry: false,
        gcTime: 0,
      }),
    });
    const list = fromStore(store, (s) => s.list);
    const a = vi.fn();
    const b = vi.fn();
    const unA = list.subscribe(a);
    const unB = list.subscribe(b);
    expect(store.status('list').isActive).toBe(true);

    await vi.waitFor(() => expect(a).toHaveBeenLastCalledWith([1, 2]));
    expect(b).toHaveBeenLastCalledWith([1, 2]);
    expect(loads).toBe(1);

    unA();
    expect(store.status('list').isActive).toBe(true);
    unB();
    expect(store.status('list').isActive).toBe(false);
  });

  it('exposes remote status as a store', async () => {
    const store = createStore({
      list: remote({ deps: () => '/x', fetch: async () => [1], retry: false }),
    });
    const status = fromStatus(store, 'list');
    const seen: string[] = [];
    const unsubscribe = status.subscribe((s) => seen.push(s.status));
    await vi.waitFor(() => expect(seen.at(-1)).toBe('success'));
    expect(seen[0]).toBe('pending');
    unsubscribe();
    expect(store.status('list').isActive).toBe(false);
  });

  it('releases the store subscription when the first call throws', () => {
    const store = createStore({
      list: remote({ deps: () => '/x', fetch: async () => [1], retry: false }),
    });
    const list = fromStore(store, (s) => s.list);
    expect(() =>
      list.subscribe(() => {
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(store.status('list').isActive).toBe(false);
  });

  it('starts from the value a remote reaches while the subscription opens', () => {
    const sync = createStore({ city: remote({ deps: () => [], fetch: () => ({ name: 'sync' }), retry: 0 }) });
    const seen: unknown[] = [];
    const stop = fromStore(sync, (s) => s.city).subscribe((v) => seen.push(v));
    expect(seen.at(-1)).toEqual({ name: 'sync' });
    stop();
  });
});
