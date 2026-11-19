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
  it('loads on first subscribe and unloads when unused', async () => {
    let loads = 0;
    const store = createStore({
      q: 'a',
      users: remote({
        key: (s) => `/users?q=${s.q}`,
        fetch: async (key) => {
          loads++;
          return { key, list: [1] };
        },
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
    await vi.waitFor(() => expect(store.get((s) => s.users)).toEqual({ key: '/users?q=a', list: [1] }));
    expect(loads).toBe(1);
    expect(seen.at(-1)).toEqual({ key: '/users?q=a', list: [1] });

    store.set('q', 'b');
    await vi.waitFor(() => expect(store.get((s) => s.users)).toEqual({ key: '/users?q=b', list: [1] }));
    expect(loads).toBe(2);

    stop();
    expect(store.get((s) => s.users)).toBeUndefined();
    expect(store.meta('users')).toMatchObject({ data: undefined, loading: false, key: undefined });
  });

  it('refetches manually while watched', async () => {
    let loads = 0;
    const store = createStore({
      users: remote({
        key: () => '/users',
        fetch: async () => ++loads,
      }),
    });
    store.subscribe((s) => s.users, () => {});
    await vi.waitFor(() => expect(store.get((s) => s.users)).toBe(1));
    await store.refetch('users');
    expect(store.get((s) => s.users)).toBe(2);
  });

  it('send posts and refetches', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST') return new Response('ok', { status: 200 });
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const store = createStore({
      users: remote({
        key: () => '/api/users',
        fetch: async (url, { signal }) => {
          const res = await fetch(String(url), { signal });
          return res.json();
        },
      }),
    });
    store.subscribe((s) => s.users, () => {});
    await vi.waitFor(() => expect(store.get((s) => s.users)).toEqual({ ok: true }));
    await store.send('users', {
      method: 'POST',
      body: JSON.stringify({ name: 'Ada' }),
      headers: { 'content-type': 'application/json' },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/users',
      expect.objectContaining({ method: 'POST' }),
    );
    await vi.waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(3));
    vi.unstubAllGlobals();
  });
});
