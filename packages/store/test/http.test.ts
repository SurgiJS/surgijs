import { describe, expect, it, vi } from 'vitest';
import { RemoteError, createStore, fromResponse, isRemoteError, remote } from '@surgijs/store';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
  });
}

describe('fromResponse', () => {
  it('returns null for empty 200 (not an error)', async () => {
    const data = await fromResponse(new Response('', { status: 200 }));
    expect(data).toBeNull();
  });

  it('returns null for 204', async () => {
    expect(await fromResponse(new Response(null, { status: 204 }))).toBeNull();
  });

  it('throws RemoteError on 404 with status/code', async () => {
    const report = vi.fn();
    await expect(fromResponse(jsonResponse({ message: 'missing' }, 404), { report })).rejects.toMatchObject({
      name: 'RemoteError',
      status: 404,
      code: 404,
      message: 'missing',
    });
    expect(report).toHaveBeenCalledWith({ status: 404, code: 404 });
  });

  it('throws on 200 body with ok:false / error payload', async () => {
    await expect(fromResponse(jsonResponse({ ok: false, code: 'NOPE', message: 'denied' }))).rejects.toMatchObject({
      status: 200,
      code: 'NOPE',
      message: 'denied',
    });
  });
});

describe('remote status: empty vs 404 vs app error', () => {
  it('marks empty 200 as success + isEmpty, not error', async () => {
    const store = createStore({
      list: remote({
        deps: () => '/empty',
        fetch: async (_get, { report }) => fromResponse(new Response('', { status: 200 }), { report }),
      }),
    });
    store.subscribe((s) => s.list, () => {});
    await vi.waitFor(() => expect(store.status('list').isSuccess).toBe(true));
    const st = store.status('list');
    expect(st.data).toBeNull();
    expect(st.isEmpty).toBe(true);
    expect(st.isError).toBe(false);
    expect(st.httpStatus).toBe(200);
    expect(st.hasData).toBe(true);
  });

  it('marks 404 as error with httpStatus', async () => {
    const store = createStore({
      list: remote({
        deps: () => '/missing',
        fetch: async (_get, { report }) => fromResponse(jsonResponse({ message: 'nope' }, 404), { report }),
      }),
    });
    store.subscribe((s) => s.list, () => {});
    await vi.waitFor(() => expect(store.status('list').isError).toBe(true));
    const st = store.status('list');
    expect(st.data).toBeUndefined();
    expect(st.isEmpty).toBe(false);
    expect(st.httpStatus).toBe(404);
    expect(st.code).toBe(404);
    expect(isRemoteError(st.error)).toBe(true);
    expect((st.error as RemoteError).message).toBe('nope');
  });

  it('marks 200 + error body as error with code', async () => {
    const store = createStore({
      list: remote({
        deps: () => '/app-err',
        fetch: async (_get, { report }) =>
          fromResponse(jsonResponse({ ok: false, code: 'VALIDATION', message: 'bad' }), { report }),
      }),
    });
    store.subscribe((s) => s.list, () => {});
    await vi.waitFor(() => expect(store.status('list').isError).toBe(true));
    const st = store.status('list');
    expect(st.httpStatus).toBe(200);
    expect(st.code).toBe('VALIDATION');
    expect(st.isSuccess).toBe(false);
  });
});
