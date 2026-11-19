import type { Get, SetStore } from './action';
import { isRemoteError } from './http';
import type { RemoteKeys, RemoteReport, StoreState } from './remote';
import type { Selector, Store } from './store';

/** Internal lifecycle (maps to public `status`). */
type MutationPhaseInternal = 'idle' | 'pending' | 'success' | 'error';

/**
 * Single UI discriminator for `mutation.status(store).status`.
 * Prefer `switch (st.status)` over juggling booleans.
 */
export type MutationPhase = 'idle' | 'pending' | 'success' | 'err';

/** @deprecated Use `MutationPhase`. */
export type MutationUiSt = MutationPhase;

export interface MutationStatus<T> {
  data: T | undefined;
  error: unknown;
  /** One place for UI: `'idle' | 'pending' | 'success' | 'err'`. */
  status: MutationPhase;
  isPending: boolean;
  isSuccess: boolean;
  isError: boolean;
  isIdle: boolean;
  httpStatus: number | undefined;
  code: string | number | undefined;
  /** When the current/last run started. */
  submittedAt: number;
  dataUpdatedAt: number;
  errorUpdatedAt: number;
}

export interface MutationContext<D extends Record<string, unknown>> {
  get: Get<D>;
  set: SetStore<D>;
  signal: AbortSignal;
  /** Attach HTTP / app codes to mutation status. */
  report: (info: RemoteReport) => void;
  /** Reload watched remotes after a successful write. */
  refetch: (...keys: RemoteKeys<D>[]) => Promise<void>;
}

export type MutateFn<D extends Record<string, unknown>, Input, Result> = (
  input: Input,
  ctx: MutationContext<D>,
) => Result | PromiseLike<Result>;

type Entry<T> = {
  data: T | undefined;
  error: unknown;
  phase: MutationPhaseInternal;
  httpStatus: number | undefined;
  code: string | number | undefined;
  submittedAt: number;
  dataUpdatedAt: number;
  errorUpdatedAt: number;
  seq: number;
  ctrl: AbortController | null;
  listeners: Set<() => void>;
};

function emptyEntry<T>(): Entry<T> {
  return {
    data: undefined,
    error: undefined,
    phase: 'idle',
    httpStatus: undefined,
    code: undefined,
    submittedAt: 0,
    dataUpdatedAt: 0,
    errorUpdatedAt: 0,
    seq: 0,
    ctrl: null,
    listeners: new Set(),
  };
}

function toUiStatus(phase: MutationPhaseInternal): MutationPhase {
  return phase === 'error' ? 'err' : phase;
}

function snapshot<T>(e: Entry<T>): MutationStatus<T> {
  return {
    data: e.data,
    error: e.error,
    status: toUiStatus(e.phase),
    isPending: e.phase === 'pending',
    isSuccess: e.phase === 'success',
    isError: e.phase === 'error',
    isIdle: e.phase === 'idle',
    httpStatus: e.httpStatus,
    code: e.code,
    submittedAt: e.submittedAt,
    dataUpdatedAt: e.dataUpdatedAt,
    errorUpdatedAt: e.errorUpdatedAt,
  };
}

function notify(e: Entry<unknown>): void {
  for (const fn of e.listeners) fn();
}

function makeGet<D extends Record<string, unknown>>(store: Store<D>): Get<D> {
  return ((keyOrSelector?: unknown) => {
    if (keyOrSelector === undefined) return store.get();
    if (typeof keyOrSelector === 'function') return store.get(keyOrSelector as Selector<D, unknown>);
    return store.get((s) => s[keyOrSelector as keyof StoreState<D>]);
  }) as Get<D>;
}

export type Mutation<Input, Result> = {
  <D extends Record<string, unknown>>(store: Store<D>, input: Input): Promise<Result>;
  bind<D extends Record<string, unknown>>(store: Store<D>): (input: Input) => Promise<Result>;
  status<D extends Record<string, unknown>>(store: Store<D>): MutationStatus<Result>;
  subscribe<D extends Record<string, unknown>>(store: Store<D>, listener: () => void): () => void;
  reset<D extends Record<string, unknown>>(store: Store<D>): void;
};

/**
 * Server write (create / update / delete) with its own UI status.
 * Independent of `remote()` — POST/PUT/PATCH/DELETE without a read cache.
 *
 * ```ts
 * const createUser = mutation(async (input: { name: string }, { signal, report, refetch }) => {
 *   const res = await fetch('/api/users', {
 *     method: 'POST',
 *     headers: { 'content-type': 'application/json' },
 *     body: JSON.stringify(input),
 *     signal,
 *   });
 *   const user = await fromResponse(res, { report });
 *   await refetch('users');
 *   return user;
 * });
 *
 * await createUser(store, { name: 'Ada' });
 * createUser.status(store); // .status / isPending / isError / httpStatus / code
 * ```
 */
export function mutation<Input, Result>(
  fn: MutateFn<Record<string, any>, Input, Result>,
): Mutation<Input, Result> {
  const byStore = new WeakMap<object, Entry<Result>>();

  const entryOf = (store: object): Entry<Result> => {
    let e = byStore.get(store);
    if (!e) byStore.set(store, (e = emptyEntry()));
    return e;
  };

  const run = (async <D extends Record<string, unknown>>(store: Store<D>, input: Input) => {
    const e = entryOf(store as object);
    e.ctrl?.abort();
    const ctrl = new AbortController();
    e.ctrl = ctrl;
    const seq = ++e.seq;
    e.phase = 'pending';
    e.error = undefined;
    e.submittedAt = Date.now();
    notify(e);

    const report = (info: RemoteReport) => {
      if (seq !== e.seq) return;
      if (info.status !== undefined) e.httpStatus = info.status;
      if (info.code !== undefined) e.code = info.code;
      notify(e);
    };

    const refetch = async (...keys: RemoteKeys<D>[]) => {
      await Promise.all(keys.map((k) => store.refetch(k)));
    };

    try {
      const result = await fn(input, {
        get: makeGet(store) as Get<Record<string, any>>,
        set: store.set as SetStore<Record<string, any>>,
        signal: ctrl.signal,
        report,
        refetch: refetch as MutationContext<Record<string, any>>['refetch'],
      });
      if (seq !== e.seq) return result;
      e.phase = 'success';
      e.data = result;
      e.error = undefined;
      e.dataUpdatedAt = Date.now();
      if (e.httpStatus === undefined) e.httpStatus = 200;
      notify(e);
      return result;
    } catch (err) {
      if (seq !== e.seq || (err && typeof err === 'object' && (err as { name?: string }).name === 'AbortError')) {
        throw err;
      }
      e.phase = 'error';
      e.error = err;
      e.errorUpdatedAt = Date.now();
      if (isRemoteError(err)) {
        if (err.status !== undefined) e.httpStatus = err.status;
        if (err.code !== undefined) e.code = err.code;
      }
      notify(e);
      throw err;
    }
  }) as Mutation<Input, Result>;

  run.bind = <D extends Record<string, unknown>>(store: Store<D>) => (input: Input) => run(store, input);

  run.status = <D extends Record<string, unknown>>(store: Store<D>) => snapshot(entryOf(store as object));

  run.subscribe = <D extends Record<string, unknown>>(store: Store<D>, listener: () => void) => {
    const e = entryOf(store as object);
    e.listeners.add(listener);
    return () => {
      e.listeners.delete(listener);
    };
  };

  run.reset = <D extends Record<string, unknown>>(store: Store<D>) => {
    const e = entryOf(store as object);
    e.ctrl?.abort();
    e.ctrl = null;
    e.seq++;
    const listeners = e.listeners;
    Object.assign(e, emptyEntry<Result>());
    e.listeners = listeners;
    notify(e);
  };

  return run;
}

/** One-off mutate on a store (no persistent status object). */
export async function runMutation<D extends Record<string, unknown>, Result>(
  store: Store<D>,
  fn: (ctx: MutationContext<D>) => Result | PromiseLike<Result>,
): Promise<Result> {
  const ctrl = new AbortController();
  const refetch = async (...keys: RemoteKeys<D>[]) => {
    await Promise.all(keys.map((k) => store.refetch(k)));
  };
  return fn({
    get: makeGet(store),
    set: store.set as SetStore<D>,
    signal: ctrl.signal,
    report: () => {},
    refetch,
  });
}
