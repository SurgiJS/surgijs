import { describe, expect, it, vi } from 'vitest';
import { createStore, fromResponse, mutation, remote } from '@surgijs/store';

describe('mutation', () => {
  it('creates a user, exposes status, and refetches a list', async () => {
    let listLoads = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === 'POST') {
        return new Response(JSON.stringify({ id: '1', name: 'Ada' }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        });
      }
      listLoads++;
      return new Response(JSON.stringify([{ id: '1', name: 'Ada' }]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const store = createStore({
      users: remote({
        deps: () => '/api/users',
        fetch: async (_get, { signal, report, deps }) => {
          const res = await fetch(String(deps), { signal });
          return fromResponse<{ id: string; name: string }[]>(res, { report });
        },
      }),
    });

    store.subscribe((s) => s.users, () => {});
    await vi.waitFor(() => expect(store.get((s) => s.users)).toEqual([{ id: '1', name: 'Ada' }]));
    const loadsAfterWatch = listLoads;

    const createUser = mutation(async (input: { name: string }, { signal, report, refetch }) => {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
        signal,
      });
      const user = await fromResponse<{ id: string; name: string }>(res, { report });
      await refetch('users');
      return user;
    });

    expect(createUser.status(store).isIdle).toBe(true);
    const pending: boolean[] = [];
    createUser.subscribe(store, () => pending.push(createUser.status(store).isPending));

    const user = await createUser(store, { name: 'Ada' });
    expect(user).toEqual({ id: '1', name: 'Ada' });
    expect(createUser.status(store)).toMatchObject({
      status: 'success',
      isSuccess: true,
      isPending: false,
      httpStatus: 201,
      data: { id: '1', name: 'Ada' },
    });
    expect(pending.some(Boolean)).toBe(true);
    expect(listLoads).toBeGreaterThan(loadsAfterWatch);

    vi.unstubAllGlobals();
  });

  it('surfaces 400 app errors on mutation status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ message: 'taken', code: 'EXISTS' }), { status: 400 })),
    );

    const store = createStore({ n: 0 });
    const createUser = mutation(async (_input: { name: string }, { signal, report }) => {
      const res = await fetch('/api/users', { method: 'POST', signal });
      return fromResponse(res, { report });
    });

    await expect(createUser(store, { name: 'Ada' })).rejects.toMatchObject({ status: 400, code: 'EXISTS' });
    expect(createUser.status(store)).toMatchObject({
      status: 'err',
      isError: true,
      httpStatus: 400,
      code: 'EXISTS',
    });
    vi.unstubAllGlobals();
  });

  it('store.mutate one-off create', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ id: '2' }), { status: 200, headers: { 'content-type': 'application/json' } })),
    );
    const store = createStore({ lastId: '' });
    const id = await store.mutate(async ({ set, signal, report }) => {
      const res = await fetch('/api/users', { method: 'POST', signal });
      const user = await fromResponse<{ id: string }>(res, { report });
      set('lastId', user.id);
      return user.id;
    });
    expect(id).toBe('2');
    expect(store.get((s) => s.lastId)).toBe('2');
    vi.unstubAllGlobals();
  });
});
