import { describe, expect, it, vi } from 'vitest';
import { action, createStore, derived, remote } from '@surgijs/store';

describe('createStore sync', () => {
  it('reads and writes one object', () => {
    const store = createStore({ count: 0, user: { name: 'Ada' } });
    expect(store.get((s) => s.count)).toBe(0);
    store.set('count', 1);
    store.set({ user: { name: 'Ada' } });
    expect(store.get()).toEqual({ count: 1, user: { name: 'Ada' } });
  });

  it('skips deep-equal writes and keeps subscriber quiet', () => {
    const store = createStore({ user: { name: 'Ada', tags: ['a'] } });
    let calls = 0;
    store.subscribe(
      (s) => s.user,
      () => {
        calls++;
      },
    );
    store.set('user', { name: 'Ada', tags: ['a'] });
    expect(calls).toBe(0);
    store.set('user', { name: 'Ada', tags: ['a', 'b'] });
    expect(calls).toBe(1);
  });

  it('does not notify when a selected slice is unchanged', () => {
    const store = createStore({ count: 0, label: 'x' });
    let calls = 0;
    let last: string | undefined;
    store.subscribe(
      (s) => s.label,
      (v) => {
        calls++;
        last = v;
      },
    );
    store.set('count', 1);
    store.set('count', 2);
    expect(calls).toBe(0);
    store.set('label', 'y');
    expect(calls).toBe(1);
    expect(last).toBe('y');
  });
});

describe('action / write / derived', () => {
  it('supports jotai-style writers', () => {
    const store = createStore({ count: 3 });
    const multiplyCount = action((get, set, by: number) => {
      set('count', get('count') * by);
    });
    multiplyCount(store, 2);
    expect(store.get((s) => s.count)).toBe(6);

    const add = store.write((get, set, n: number) => set('count', get('count') + n));
    add(4);
    expect(store.get((s) => s.count)).toBe(10);
  });

  it('caches derived values and keeps prior reference when equal', () => {
    const store = createStore({ items: [{ n: 1 }, { n: 2 }] as { n: number }[] });
    const total = derived((get) => {
      const items = get('items') as { n: number }[];
      return { sum: items.reduce((a: number, x: { n: number }) => a + x.n, 0) };
    });
    const a = total(store);
    const b = total(store);
    expect(a).toBe(b);
    store.set('items', [{ n: 1 }, { n: 2 }]);
    const c = total(store);
    expect(c).toBe(a);
    store.set('items', [{ n: 1 }, { n: 3 }]);
    const d = total(store);
    expect(d).not.toBe(a);
    expect(d).toEqual({ sum: 4 });
  });
});

describe('remote', () => {
  it('loads on first subscribe, keeps cache for gcTime, then unloads', async () => {
    vi.useFakeTimers();
    let loads = 0;
    const store = createStore({
      q: 'a',
      users: remote({
        deps: (s) => `/users?q=${s.q}`,
        fetch: async (get, { deps }) => {
          loads++;
          return { key: deps, q: get('q'), list: [1] };
        },
        gcTime: 60_000,
        staleTime: Infinity,
      }),
    });

    expect(store.get((s) => s.users)).toBeUndefined();
    const seen: unknown[] = [];
    const stop = store.subscribe(
      (s) => s.users,
      (v) => {
        seen.push(v);
      },
    );
    await vi.waitFor(() =>
      expect(store.get((s) => s.users)).toEqual({ key: '/users?q=a', q: 'a', list: [1] }),
    );
    expect(loads).toBe(1);
    expect(seen.at(-1)).toEqual({ key: '/users?q=a', q: 'a', list: [1] });

    store.set('q', 'b');
    await vi.waitFor(() =>
      expect(store.get((s) => s.users)).toEqual({ key: '/users?q=b', q: 'b', list: [1] }),
    );
    expect(loads).toBe(2);

    stop();
    expect(store.get((s) => s.users)).toEqual({ key: '/users?q=b', q: 'b', list: [1] });

    const stop2 = store.subscribe((s) => s.users, () => {});
    await Promise.resolve();
    expect(loads).toBe(2);
    stop2();

    await vi.advanceTimersByTimeAsync(60_000);
    expect(store.get((s) => s.users)).toBeUndefined();
    expect(store.status('users')).toMatchObject({
      data: undefined,
      isFetching: false,
      deps: undefined,
    });
    vi.useRealTimers();
  });

  it('refetches on remount when staleTime is 0', async () => {
    let loads = 0;
    const store = createStore({
      users: remote({
        deps: () => '/users',
        fetch: async () => ++loads,
        gcTime: 60_000,
        staleTime: 0,
        retry: false,
      }),
    });
    const stop = store.subscribe((s) => s.users, () => {});
    await vi.waitFor(() => expect(store.get((s) => s.users)).toBe(1));
    stop();
    store.subscribe((s) => s.users, () => {});
    await vi.waitFor(() => expect(loads).toBe(2));
  });

  it('unloads immediately when gcTime is 0', async () => {
    let loads = 0;
    const store = createStore({
      users: remote({
        deps: () => '/users',
        fetch: async () => ++loads,
        gcTime: 0,
        retry: false,
      }),
    });
    const stop = store.subscribe((s) => s.users, () => {});
    await vi.waitFor(() => expect(store.get((s) => s.users)).toBe(1));
    stop();
    expect(store.get((s) => s.users)).toBeUndefined();
  });

  it('calls fetch only when deps change, not on unrelated writes', async () => {
    let loads = 0;
    const store = createStore({
      windowLocation: '/api/search',
      windowQueryParams: { q: 'a' } as Record<string, string>,
      noise: 0,
      results: remote({
        deps: (get) => [get.windowLocation, get.windowQueryParams],
        fetch: async (get, { signal }) => {
          loads++;
          const path = get('windowLocation') as string;
          const params = new URLSearchParams(get('windowQueryParams') as Record<string, string>);
          void signal;
          return { url: `${path}?${params}`, n: loads };
        },
        retry: false,
        staleTime: Infinity,
      }),
    });

    store.subscribe((s) => s.results, () => {});
    await vi.waitFor(() => expect(store.get((s) => s.results)).toEqual({ url: '/api/search?q=a', n: 1 }));

    store.set('noise', 1);
    store.set('noise', 2);
    await Promise.resolve();
    expect(loads).toBe(1);

    store.set('windowQueryParams', { q: 'b' });
    await vi.waitFor(() => expect(store.get((s) => s.results)).toEqual({ url: '/api/search?q=b', n: 2 }));

    store.set('windowLocation', '/api/other');
    await vi.waitFor(() => expect(store.get((s) => s.results)).toEqual({ url: '/api/other?q=b', n: 3 }));
    expect(loads).toBe(3);
  });

  it('retries failed fetches', async () => {
    let loads = 0;
    const store = createStore({
      users: remote({
        deps: () => '/users',
        fetch: async () => {
          loads++;
          if (loads < 3) throw new Error('boom');
          return loads;
        },
        retry: 2,
        retryDelay: 0,
        staleTime: Infinity,
      }),
    });
    store.subscribe((s) => s.users, () => {});
    await vi.waitFor(() => expect(store.get((s) => s.users)).toBe(3));
    expect(loads).toBe(3);
  });

  it('prefetch warms cache without a subscriber', async () => {
    let loads = 0;
    const store = createStore({
      users: remote({
        deps: () => '/users',
        fetch: async () => ++loads,
        gcTime: 60_000,
        staleTime: Infinity,
        retry: false,
      }),
    });
    await store.prefetch('users');
    expect(store.get((s) => s.users)).toBe(1);
    expect(store.status('users').status).toBe('success');
    store.subscribe((s) => s.users, () => {});
    await Promise.resolve();
    expect(loads).toBe(1);
  });

  it('setData patches remote optimistically', async () => {
    const store = createStore({
      users: remote({
        deps: () => '/users',
        fetch: async () => [{ id: '1', name: 'Ada' }],
        retry: false,
        staleTime: Infinity,
      }),
    });
    store.subscribe((s) => s.users, () => {});
    await vi.waitFor(() => expect(store.get((s) => s.users)?.length).toBe(1));
    store.setData('users', (prev) => [...(prev ?? []), { id: 'tmp', name: 'Bob' }]);
    expect(store.get((s) => s.users)).toEqual([
      { id: '1', name: 'Ada' },
      { id: 'tmp', name: 'Bob' },
    ]);
    expect(store.status('users').source).toBe('optimistic');
  });

  it('shows placeholderData while pending', async () => {
    let resolve!: (v: number) => void;
    const store = createStore({
      users: remote({
        deps: () => '/users',
        fetch: () => new Promise<number>((r) => {
          resolve = r;
        }),
        placeholderData: 0,
        retry: false,
      }),
    });
    store.subscribe((s) => s.users, () => {});
    expect(store.get((s) => s.users)).toBe(0);
    expect(store.status('users').isPending).toBe(true);
    resolve(7);
    await vi.waitFor(() => expect(store.get((s) => s.users)).toBe(7));
  });

  it('refetches manually while watched', async () => {
    let loads = 0;
    const store = createStore({
      users: remote({
        deps: () => '/users',
        fetch: async () => ++loads,
        retry: false,
      }),
    });
    store.subscribe((s) => s.users, () => {});
    await vi.waitFor(() => expect(store.get((s) => s.users)).toBe(1));
    await store.refetch('users');
    expect(store.get((s) => s.users)).toBe(2);
  });

  it('re-tracks remotes when selector branch changes', async () => {
    let aLoads = 0;
    let bLoads = 0;
    const store = createStore({
      mode: 'a' as 'a' | 'b',
      a: remote({
        deps: () => 'a',
        fetch: async () => ++aLoads,
        retry: false,
        staleTime: Infinity,
      }),
      b: remote({
        deps: () => 'b',
        fetch: async () => ++bLoads,
        retry: false,
        staleTime: Infinity,
      }),
    });
    const seen: unknown[] = [];
    store.subscribe(
      (s) => (s.mode === 'a' ? s.a : s.b),
      (v) => {
        seen.push(v);
      },
    );
    await vi.waitFor(() => expect(store.get((s) => s.a)).toBe(1));
    expect(bLoads).toBe(0);
    store.set('mode', 'b');
    await vi.waitFor(() => expect(store.get((s) => s.b)).toBe(1));
    expect(seen).toContain(1);
  });

  it('notifies nested writes queued during flush', () => {
    const store = createStore({ a: 0, b: 0, c: 0 });
    const order: string[] = [];
    store.subscribe(
      (s) => s.a,
      () => {
        order.push('a');
        store.set('b', 1);
      },
    );
    store.subscribe(
      (s) => s.b,
      () => {
        order.push('b');
        store.set('c', 1);
      },
    );
    store.subscribe(
      (s) => s.c,
      () => {
        order.push('c');
      },
    );
    store.set('a', 1);
    expect(order).toEqual(['a', 'b', 'c']);
    expect(store.get()).toEqual({ a: 1, b: 1, c: 1 });
  });

  it('clears error code after a successful refetch', async () => {
    let fail = true;
    const store = createStore({
      list: remote({
        deps: () => '/x',
        fetch: async (_get, { report }) => {
          if (fail) {
            report({ status: 404, code: 'MISSING' });
            throw Object.assign(new Error('nope'), { status: 404, code: 'MISSING' });
          }
          report({ status: 200 });
          return [1];
        },
        retry: false,
      }),
    });
    store.subscribe((s) => s.list, () => {});
    await vi.waitFor(() => expect(store.status('list').isError).toBe(true));
    expect(store.status('list').code).toBe('MISSING');
    fail = false;
    await store.refetch('list');
    expect(store.status('list')).toMatchObject({ status: 'success', code: undefined, httpStatus: 200 });
  });

  it('notifies a subscriber of changes made while its remotes start loading', () => {
    const store = createStore({ city: remote({ deps: () => [], fetch: () => new Promise<never>(() => {}) }) });
    const read = () => store.status('city').isPending;
    const seen: boolean[] = [];
    const stop = store.subscribe(read, (v) => seen.push(v));
    expect(seen).toEqual([true]);
    stop();
  });
});
