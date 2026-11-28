import { describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, watch } from 'vue';
import { createStore, remote } from '@surgijs/store';
import { fromStatus, fromStore } from '@surgijs/store/vue';

describe('vue adapter', () => {
  it('updates the ref when the selected value changes and ends with the scope', () => {
    const store = createStore({ count: 1, other: 0 });
    const scope = effectScope();
    const count = scope.run(() => fromStore(store, (s) => s.count))!;
    expect(count.value).toBe(1);

    store.set('count', 2);
    expect(count.value).toBe(2);

    store.set('other', 5);
    scope.stop();
    store.set('count', 3);
    expect(count.value).toBe(2);
  });

  it('keeps the previous reference for deep-equal values', () => {
    const store = createStore({ user: { name: 'ada' } as { name: string }, noise: 0 });
    const scope = effectScope();
    const user = scope.run(() => fromStore(store, (s) => s.user))!;
    const first = user.value;

    store.set('user', { name: 'ada' });
    expect(user.value).toBe(first);

    store.set('user', { name: 'grace' });
    expect(user.value).not.toBe(first);
    scope.stop();
  });

  it('drives watchers and loads remotes while the scope is alive', async () => {
    let loads = 0;
    const store = createStore({
      id: 1,
      city: remote({
        deps: (get) => [get.id],
        fetch: async (get) => {
          loads++;
          return { name: `city-${get('id')}` };
        },
        retry: false,
      }),
    });
    const scope = effectScope();
    const seen: string[] = [];
    const city = scope.run(() => {
      const city = fromStore(store, (s) => s.city);
      watch(city, (c) => seen.push(c?.name ?? 'none'));
      return city;
    })!;

    await vi.waitFor(() => expect(city.value?.name).toBe('city-1'));
    expect(store.status('city').isActive).toBe(true);

    store.set('id', 2);
    await vi.waitFor(() => expect(city.value?.name).toBe('city-2'));
    await nextTick();
    expect(seen).toEqual(['city-1', 'none', 'city-2']);
    expect(loads).toBe(2);

    scope.stop();
    expect(store.status('city').isActive).toBe(false);
  });

  it('exposes remote status as a ref', async () => {
    const store = createStore({
      list: remote({ deps: () => '/x', fetch: async () => [1, 2], retry: false }),
    });
    const scope = effectScope();
    const status = scope.run(() => fromStatus(store, 'list'))!;
    expect(status.value.status).toBe('pending');

    await vi.waitFor(() => expect(status.value.status).toBe('success'));
    expect(status.value.data).toEqual([1, 2]);
    scope.stop();
    expect(store.status('list').isActive).toBe(false);
  });

  it('starts from the value a remote reaches while the subscription opens', () => {
    const sync = createStore({ city: remote({ deps: () => [], fetch: () => ({ name: 'sync' }), retry: 0 }) });
    const scope = effectScope();
    const city = scope.run(() => fromStore(sync, (s) => s.city))!;
    expect(city.value).toEqual({ name: 'sync' });

    const pending = createStore({ city: remote({ deps: () => [], fetch: () => new Promise<never>(() => {}) }) });
    const status = scope.run(() => fromStatus(pending, 'city'))!;
    expect(status.value.isPending).toBe(true);
    scope.stop();
  });
});
