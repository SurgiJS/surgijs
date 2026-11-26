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
        retry: false,
        staleTime: Infinity,
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

  it('rolls back optimistic setData on error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ message: 'taken', code: 'EXISTS' }), { status: 400 })),
    );

    const store = createStore({
      users: remote({
        deps: () => '/api/users',
        fetch: async () => [{ id: '1', name: 'Ada' }],
        retry: false,
        staleTime: Infinity,
      }),
    });
    store.subscribe((s) => s.users, () => {});
    await vi.waitFor(() => expect(store.get((s) => s.users)?.length).toBe(1));

    type User = { id: string; name: string };
    const createUser = mutation(async (input: { name: string }, { getData, setData, signal, report }) => {
      const prev = getData('users') as User[] | undefined;
      setData('users', [...(prev ?? []), { id: 'tmp', name: input.name }]);
      try {
        const res = await fetch('/api/users', { method: 'POST', signal });
        return await fromResponse(res, { report });
      } catch (e) {
        setData('users', prev as User[] | undefined);
        throw e;
      }
    });

    await expect(createUser(store, { name: 'Ada' })).rejects.toMatchObject({ status: 400, code: 'EXISTS' });
    expect(store.get((s) => s.users)).toEqual([{ id: '1', name: 'Ada' }]);
    expect(createUser.status(store)).toMatchObject({
      status: 'err',
      isError: true,
      httpStatus: 400,
      code: 'EXISTS',
    });
    vi.unstubAllGlobals();
  });
});
