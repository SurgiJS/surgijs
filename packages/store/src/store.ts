import type { Get, SetStore } from './action';
import { connectDevtools } from './devtools';
import { deepEqual } from './equal';
import { isRemoteError } from './http';
import {
  DEFAULT_GC_TIME,
  DEFAULT_STALE_TIME,
  createRemoteGet,
  defaultRetryDelay,
  isEmptyData,
  isRemote,
  resolvePlaceholder,
  type RemoteData,
  type RemoteDef,
  type RemoteKey,
  type RemoteKeys,
  type RemoteMeta,
  type RetryDelay,
  type StoreState,
  type SyncKeys,
} from './remote';

export type Selector<D extends Record<string, unknown>, T> = (state: StoreState<D>) => T;
export type Listener<T> = (value: T, prev: T) => void;
export type Equals<T> = (a: T, b: T) => boolean;

export interface SubscribeOptions<T> {
  /** Defaults to structural `deepEqual`. Equal values keep the previous reference and skip the listener. */
  equals?: Equals<T>;
  /** Fire `listener` once with the current value right away. */
  fireImmediately?: boolean;
}

type RemoteEntry = {
  def: RemoteDef<unknown>;
  data: unknown;
  error: unknown;
  fetching: boolean;
  lastStatus: 'success' | 'error' | undefined;
  key: RemoteKey | undefined;
  dataKey: RemoteKey | undefined;
  timer: ReturnType<typeof setTimeout> | null;
  depKeys: Set<string> | null;
  refs: number;
  seq: number;
  ctrl: AbortController | null;
  gc: ReturnType<typeof setTimeout> | null;
  dataUpdatedAt: number;
  errorUpdatedAt: number;
  fetchStartedAt: number;
  source: 'network' | 'cache' | 'optimistic' | undefined;
  httpStatus: number | undefined;
  code: string | number | undefined;
};

type Sub<D extends Record<string, unknown>> = {
  selector: Selector<D, unknown>;
  listener: Listener<unknown>;
  equals: Equals<unknown>;
  value: unknown;
  keys: Set<string>;
};

export interface Store<D extends Record<string, unknown>> {
  get(): StoreState<D>;
  get<T>(selector: Selector<D, T>): T;

  set<K extends SyncKeys<D>>(key: K, value: D[K]): void;
  set(partial: Partial<{ [K in SyncKeys<D>]: D[K] }>): void;

  /**
   * Optimistically patch a remote field (or write placeholder). Use with `mutation` rollback.
   * Does not mark data as fresh for `staleTime`.
   */
  setData<K extends RemoteKeys<D>>(
    key: K,
    value:
      | RemoteData<D, K>
      | ((prev: RemoteData<D, K> | undefined) => RemoteData<D, K> | undefined),
  ): void;

  subscribe<T>(selector: Selector<D, T>, listener: Listener<T>, options?: SubscribeOptions<T>): () => void;

  /** UI status for a remote field. Reading this inside `subscribe` keeps the field loaded. */
  status<K extends RemoteKeys<D>>(key: K): RemoteMeta<RemoteData<D, K>>;

  /** Force reload. Works without subscribers (warms cache + starts GC if idle). */
  refetch<K extends RemoteKeys<D>>(key: K): Promise<RemoteData<D, K> | undefined>;

  /** Alias of `refetch` for route preload. */
  prefetch<K extends RemoteKeys<D>>(key: K): Promise<RemoteData<D, K> | undefined>;

  /**
   * Bind a jotai-style writer:
   * `store.write((get, set, by) => set('count', get('count') * by))(2)`.
   * Prefer shared `action()` when the writer is reused.
   */
  write<A extends unknown[]>(fn: (get: Get<D>, set: SetStore<D>, ...args: A) => void): (...args: A) => void;
}

export interface CreateStoreOptions {
  /** Default `gcTime` for remotes. Default: 5 minutes. */
  gcTime?: number;
  /** Default `staleTime` for remotes. Default: `0` (always stale). */
  staleTime?: number;
  /** Default retry count after the first attempt. Default: `2`. */
  retry?: number | false;
  /** Default `retryDelay`. Default: exponential backoff (1s, 2s, 4s, … up to 30s). */
  retryDelay?: RetryDelay;
  /** Default `refetchOnFocus`. Default: `true`. */
  refetchOnFocus?: boolean;
  /** Default `refetchOnReconnect`. Default: `true`. */
  refetchOnReconnect?: boolean;
}

type FocusTarget = { stale: () => boolean; reload: () => void };

const focusTargets = new Set<FocusTarget>();
const onlineTargets = new Set<FocusTarget>();
let focusBound = false;
let onlineBound = false;

function ensureFocusListener(): void {
  if (focusBound || typeof document === 'undefined') return;
  focusBound = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    for (const t of focusTargets) if (t.stale()) t.reload();
  });
}

function ensureOnlineListener(): void {
  if (onlineBound || typeof window === 'undefined') return;
  onlineBound = true;
  window.addEventListener('online', () => {
    for (const t of onlineTargets) if (t.stale()) t.reload();
  });
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
      return;
    }
    const t = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function isAbortError(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as { name?: string }).name === 'AbortError';
}

export function createStore<D extends Record<string, unknown>>(def: D, options?: CreateStoreOptions): Store<D> {
  const defaultGc = options?.gcTime ?? DEFAULT_GC_TIME;
  const defaultStale = options?.staleTime ?? DEFAULT_STALE_TIME;
  const defaultRetry = options?.retry === false ? 0 : (options?.retry ?? 2);
  const defaultDelay = options?.retryDelay ?? defaultRetryDelay;
  const defaultFocus = options?.refetchOnFocus ?? true;
  const defaultOnline = options?.refetchOnReconnect ?? true;

  const sync: Record<string, unknown> = Object.create(null);
  const remotes = new Map<string, RemoteEntry>();
  const subs = new Set<Sub<D>>();
  const byKey = new Map<string, Set<Sub<D>>>();
  let version = 0;
  let view: StoreState<D> | undefined;
  let viewVersion = -1;
  let tracking: Set<string> | null = null;
  let notifying = false;
  let quiet = false;
  let restoring = false;
  let emit: (action: { type: string; key?: string }) => void = () => {};
  const pending = { keys: null as Set<string> | null, one: null as string | null };
  const focusRegs = new Map<string, FocusTarget>();
  const onlineRegs = new Map<string, FocusTarget>();

  for (const key of Object.keys(def)) {
    const value = def[key];
    if (isRemote(value)) {
      const remoteDef: RemoteDef<unknown> = {
        ...value,
        gcTime: value.gcTime ?? defaultGc,
        staleTime: value.staleTime ?? defaultStale,
        retry: value.retry === undefined ? defaultRetry : value.retry,
        retryDelay: value.retryDelay ?? defaultDelay,
        refetchOnFocus: value.refetchOnFocus ?? defaultFocus,
        refetchOnReconnect: value.refetchOnReconnect ?? defaultOnline,
      };
      const placeholder = resolvePlaceholder(remoteDef.placeholderData);
      remotes.set(key, {
        def: remoteDef,
        data: placeholder,
        error: undefined,
        fetching: false,
        lastStatus: undefined,
        key: undefined,
        dataKey: undefined,
        timer: null,
        depKeys: null,
        refs: 0,
        seq: 0,
        ctrl: null,
        gc: null,
        dataUpdatedAt: 0,
        errorUpdatedAt: 0,
        fetchStartedAt: 0,
        source: placeholder !== undefined ? 'cache' : undefined,
        httpStatus: undefined,
        code: undefined,
      });
    } else {
      sync[key] = value;
    }
  }

  const snapshot = (): StoreState<D> => {
    if (view && viewVersion === version) return view;
    const out: Record<string, unknown> = Object.create(null);
    for (const key of Object.keys(sync)) out[key] = sync[key];
    for (const [key, entry] of remotes) out[key] = entry.data;
    view = out as StoreState<D>;
    viewVersion = version;
    return view;
  };

  const bump = (): void => {
    version++;
    view = undefined;
  };

  const syncState = (): Record<string, unknown> => {
    const out: Record<string, unknown> = Object.create(null);
    for (const key of Object.keys(sync)) out[key] = sync[key];
    return out;
  };

  const staleTimeOf = (entry: RemoteEntry): number => entry.def.staleTime ?? defaultStale;

  const isStale = (entry: RemoteEntry): boolean => {
    if (entry.lastStatus !== 'success') return true;
    const st = staleTimeOf(entry);
    if (!Number.isFinite(st)) return false;
    return Date.now() - entry.dataUpdatedAt >= st;
  };

  const indexSub = (sub: Sub<D>): void => {
    for (const key of sub.keys) {
      let set = byKey.get(key);
      if (!set) byKey.set(key, (set = new Set()));
      set.add(sub);
    }
  };

  const unindexSub = (sub: Sub<D>): void => {
    for (const key of sub.keys) {
      const set = byKey.get(key);
      if (!set) continue;
      set.delete(sub);
      if (!set.size) byKey.delete(key);
    }
  };

  const setsEqual = (a: Set<string>, b: Set<string>): boolean => {
    if (a.size !== b.size) return false;
    for (const k of a) if (!b.has(k)) return false;
    return true;
  };

  /** Re-track selector keys so dynamic remotes retain/load after branch changes. */
  const flushSub = (sub: Sub<D>): void => {
    const { value, keys } = trackSelect(sub.selector as Selector<D, unknown>);
    if (!setsEqual(sub.keys, keys)) {
      unindexSub(sub);
      for (const name of sub.keys) {
        if (remotes.has(name) && !keys.has(name)) release(name);
      }
      for (const name of keys) {
        if (remotes.has(name) && !sub.keys.has(name)) retain(name);
      }
      sub.keys = keys;
      indexSub(sub);
    }
    if (sub.equals(sub.value, value)) return;
    const prev = sub.value;
    sub.value = value;
    sub.listener(value, prev);
  };

  const queueKey = (key: string): void => {
    if (pending.keys) pending.keys.add(key);
    else if (pending.one && pending.one !== key) {
      pending.keys = new Set([pending.one, key]);
      pending.one = null;
    } else pending.one = key;
  };

  const takePending = (): Set<string> | null => {
    if (pending.keys) {
      const keys = pending.keys;
      pending.keys = null;
      pending.one = null;
      return keys;
    }
    if (pending.one) {
      const key = pending.one;
      pending.one = null;
      return new Set([key]);
    }
    return null;
  };

  /** Drain notify queue until nested writes stop enqueueing keys. */
  const drainNotify = (initial: Set<string> | string): void => {
    if (notifying) {
      if (typeof initial === 'string') queueKey(initial);
      else for (const k of initial) queueKey(k);
      return;
    }
    notifying = true;
    try {
      let batch: Set<string> | null = typeof initial === 'string' ? new Set([initial]) : initial;
      while (batch) {
        pending.keys = null;
        pending.one = null;
        const seen = new Set<Sub<D>>();
        for (const key of batch) {
          const set = byKey.get(key);
          if (!set) continue;
          for (const sub of set) {
            if (seen.has(sub)) continue;
            seen.add(sub);
            flushSub(sub);
          }
        }
        batch = takePending();
      }
    } finally {
      notifying = false;
      pending.one = null;
      pending.keys = null;
    }
  };

  const notifyKey = (key: string): void => drainNotify(key);

  const notifyKeys = (changed: Set<string>): void => {
    if (changed.size === 1) {
      notifyKey(changed.values().next().value!);
      return;
    }
    drainNotify(changed);
  };

  const scheduleGc = (name: string, entry: RemoteEntry): void => {
    const ttl = entry.def.gcTime ?? DEFAULT_GC_TIME;
    if (ttl === 0) {
      unload(name, entry);
      return;
    }
    if (!Number.isFinite(ttl)) return;
    if (entry.gc) clearTimeout(entry.gc);
    entry.gc = setTimeout(() => {
      entry.gc = null;
      if (entry.refs === 0) unload(name, entry);
    }, ttl);
  };

  const clearTimer = (entry: RemoteEntry): void => {
    if (entry.timer) {
      clearTimeout(entry.timer);
      entry.timer = null;
    }
  };

  const unload = (name: string, entry: RemoteEntry): void => {
    if (entry.gc) {
      clearTimeout(entry.gc);
      entry.gc = null;
    }
    clearTimer(entry);
    entry.ctrl?.abort();
    entry.ctrl = null;
    entry.seq++;
    const placeholder = resolvePlaceholder(entry.def.placeholderData);
    entry.data = placeholder;
    entry.error = undefined;
    entry.fetching = false;
    entry.lastStatus = undefined;
    entry.key = undefined;
    entry.dataKey = undefined;
    entry.depKeys = null;
    entry.dataUpdatedAt = 0;
    entry.errorUpdatedAt = 0;
    entry.fetchStartedAt = 0;
    entry.source = placeholder !== undefined ? 'cache' : undefined;
    entry.httpStatus = undefined;
    entry.code = undefined;
    bump();
    notifyKey(name);
    unregisterFocus(name);
  };

  const unregisterFocus = (name: string): void => {
    const f = focusRegs.get(name);
    if (f) {
      focusTargets.delete(f);
      focusRegs.delete(name);
    }
    const o = onlineRegs.get(name);
    if (o) {
      onlineTargets.delete(o);
      onlineRegs.delete(name);
    }
  };

  const registerFocus = (name: string, entry: RemoteEntry): void => {
    if (entry.refs <= 0) {
      unregisterFocus(name);
      return;
    }
    if (entry.def.refetchOnFocus) {
      ensureFocusListener();
      if (!focusRegs.has(name)) {
        const t: FocusTarget = {
          stale: () => isStale(entry),
          reload: () => {
            void load(name, entry, true).catch(() => {});
          },
        };
        focusRegs.set(name, t);
        focusTargets.add(t);
      }
    }
    if (entry.def.refetchOnReconnect) {
      ensureOnlineListener();
      if (!onlineRegs.has(name)) {
        const t: FocusTarget = {
          stale: () => isStale(entry),
          reload: () => {
            void load(name, entry, true).catch(() => {});
          },
        };
        onlineRegs.set(name, t);
        onlineTargets.add(t);
      }
    }
  };

  const readDeps = (entry: RemoteEntry): RemoteKey => {
    const tracked = new Set<string>();
    const get = createRemoteGet(syncState(), tracked);
    const value = entry.def.deps(get);
    entry.depKeys = tracked;
    return value;
  };

  const applyErrorMeta = (entry: RemoteEntry, err: unknown): void => {
    if (isRemoteError(err)) {
      if (err.status !== undefined) entry.httpStatus = err.status;
      if (err.code !== undefined) entry.code = err.code;
    }
  };

  const snapshotStatus = <T>(entry: RemoteEntry): RemoteMeta<T> => {
    const isFetching = entry.fetching;
    const isSuccess = entry.lastStatus === 'success';
    const isError = entry.lastStatus === 'error';
    const isPending = isFetching && entry.lastStatus === undefined;
    const isEmpty = isSuccess && isEmptyData(entry.data);
    const status = isError
      ? 'err'
      : isPending || entry.lastStatus === undefined
        ? 'pending'
        : isEmpty
          ? 'empty'
          : 'success';
    const gcTime = entry.def.gcTime ?? DEFAULT_GC_TIME;
    const staleTime = staleTimeOf(entry);
    const dataUpdatedAt = entry.dataUpdatedAt;
    return {
      data: entry.data as T | undefined,
      error: entry.error,
      status,
      isFetching,
      isPending,
      isSuccess,
      isError,
      isEmpty,
      isStale: isStale(entry),
      isActive: entry.refs > 0,
      deps: entry.key,
      dataDeps: entry.dataKey,
      isPreviousData:
        entry.lastStatus === 'success' && entry.dataKey !== undefined && !deepEqual(entry.dataKey, entry.key),
      source: entry.source,
      httpStatus: entry.httpStatus,
      code: entry.code,
      dataUpdatedAt,
      age: dataUpdatedAt ? Date.now() - dataUpdatedAt : null,
      gcTime,
      staleTime,
    };
  };

  const settleOk = (name: string, entry: RemoteEntry, seq: number, data: unknown): unknown => {
    if (seq !== entry.seq) return entry.data;
    entry.fetching = false;
    entry.error = undefined;
    entry.lastStatus = 'success';
    entry.data = data;
    entry.dataKey = entry.key;
    entry.dataUpdatedAt = Date.now();
    entry.source = 'network';
    // Drop prior error codes; keep httpStatus if report() set it during fetch.
    entry.code = undefined;
    if (entry.httpStatus === undefined) entry.httpStatus = 200;
    bump();
    notifyKey(name);
    emit({ type: 'fetch', key: name });
    if (entry.refs === 0) scheduleGc(name, entry);
    return entry.data;
  };

  const settleErr = (name: string, entry: RemoteEntry, seq: number, err: unknown): never => {
    if (seq !== entry.seq || isAbortError(err)) {
      throw err;
    }
    entry.fetching = false;
    entry.error = err;
    entry.lastStatus = 'error';
    entry.errorUpdatedAt = Date.now();
    entry.source = 'network';
    applyErrorMeta(entry, err);
    bump();
    notifyKey(name);
    emit({ type: 'error', key: name });
    if (entry.refs === 0) scheduleGc(name, entry);
    throw err;
  };

  const runFetch = async (
    entry: RemoteEntry,
    get: ReturnType<typeof createRemoteGet>,
    deps: RemoteKey,
    report: (info: { status?: number; code?: string | number }) => void,
    signal: AbortSignal,
  ): Promise<unknown> => {
    const maxRetry = entry.def.retry ?? 0;
    let attempt = 0;
    for (;;) {
      try {
        return await entry.def.fetch(get, { signal, deps, get, report });
      } catch (err) {
        if (isAbortError(err) || attempt >= maxRetry) throw err;
        const retryDelay = entry.def.retryDelay ?? defaultDelay;
        const delay = typeof retryDelay === 'function' ? retryDelay(attempt, err) : retryDelay;
        attempt++;
        await sleep(delay, signal);
      }
    }
  };

  /** New deps: drop data fetched for the old ones unless `keepPreviousData` is set. */
  const resetForDeps = (entry: RemoteEntry): void => {
    if (entry.def.keepPreviousData) return;
    const placeholder = resolvePlaceholder(entry.def.placeholderData);
    entry.data = placeholder;
    entry.error = undefined;
    entry.lastStatus = undefined;
    entry.dataKey = undefined;
    entry.dataUpdatedAt = 0;
    entry.errorUpdatedAt = 0;
    entry.source = placeholder !== undefined ? 'cache' : undefined;
    entry.httpStatus = undefined;
    entry.code = undefined;
  };

  const load = (name: string, entry: RemoteEntry, force: boolean): Promise<unknown> => {
    const nextDeps = readDeps(entry);
    if (
      !force &&
      deepEqual(entry.key, nextDeps) &&
      (entry.fetching || (entry.lastStatus === 'success' && !isStale(entry)))
    ) {
      if (!entry.fetching && entry.lastStatus === 'success') entry.source = entry.source ?? 'cache';
      return Promise.resolve(entry.data);
    }

    clearTimer(entry);
    entry.ctrl?.abort();
    const ctrl = new AbortController();
    entry.ctrl = ctrl;
    if (entry.key !== undefined && !deepEqual(entry.key, nextDeps)) resetForDeps(entry);
    entry.key = nextDeps;
    entry.fetching = true;
    entry.fetchStartedAt = Date.now();
    entry.httpStatus = undefined;
    entry.code = undefined;
    const seq = ++entry.seq;
    bump();
    notifyKey(name);

    const get = createRemoteGet(syncState());
    const report = (info: { status?: number; code?: string | number }) => {
      if (seq !== entry.seq) return;
      if (info.status !== undefined) entry.httpStatus = info.status;
      if (info.code !== undefined) entry.code = info.code;
      bump();
      notifyKey(name);
    };

    // Sync fetch: settle immediately (no microtask race on subscribe/unsubscribe).
    if (entry.def.retry === 0) {
      try {
        const result = entry.def.fetch(get, { signal: ctrl.signal, deps: nextDeps, get, report });
        if (result == null || typeof (result as { then?: unknown }).then !== 'function') {
          return Promise.resolve(settleOk(name, entry, seq, result));
        }
        return Promise.resolve(result as PromiseLike<unknown>).then(
          (data) => settleOk(name, entry, seq, data),
          (err) => {
            if (seq !== entry.seq || isAbortError(err)) return entry.data;
            return settleErr(name, entry, seq, err);
          },
        );
      } catch (err) {
        if (seq !== entry.seq) return Promise.resolve(entry.data);
        try {
          settleErr(name, entry, seq, err);
        } catch (e) {
          return Promise.reject(e);
        }
      }
    }

    return runFetch(entry, get, nextDeps, report, ctrl.signal).then(
      (data) => settleOk(name, entry, seq, data),
      (err) => {
        if (seq !== entry.seq || isAbortError(err)) return entry.data;
        return settleErr(name, entry, seq, err);
      },
    );
  };

  const retain = (name: string): void => {
    const entry = remotes.get(name);
    if (!entry) return;
    if (entry.gc) {
      clearTimeout(entry.gc);
      entry.gc = null;
    }
    entry.refs++;
    registerFocus(name, entry);
    if (entry.refs === 1 && !restoring) void load(name, entry, false).catch(() => {});
  };

  const release = (name: string): void => {
    const entry = remotes.get(name);
    if (!entry || entry.refs <= 0) return;
    entry.refs--;
    if (entry.refs !== 0) return;

    unregisterFocus(name);
    clearTimer(entry);

    if (entry.fetching) {
      entry.ctrl?.abort();
      entry.ctrl = null;
      entry.seq++;
      entry.fetching = false;
      bump();
      notifyKey(name);
    }

    scheduleGc(name, entry);
  };

  const trackSelect = <T>(selector: Selector<D, T>): { value: T; keys: Set<string> } => {
    const tracked = new Set<string>();
    const prev = tracking;
    tracking = tracked;
    try {
      const base = snapshot();
      const proxy = new Proxy(base as object, {
        get(_t, prop, receiver) {
          if (typeof prop === 'string') tracked.add(prop);
          return Reflect.get(base, prop, receiver);
        },
        ownKeys: () => Reflect.ownKeys(base),
        getOwnPropertyDescriptor: (_t, prop) => Reflect.getOwnPropertyDescriptor(base, prop),
        has: (_t, prop) => Reflect.has(base, prop),
      }) as StoreState<D>;
      return { value: selector(proxy), keys: tracked };
    } finally {
      tracking = prev;
    }
  };

  const writeSync = (key: string, value: unknown): boolean => {
    if (remotes.has(key)) throw new Error(`@surgijs/store: "${key}" is remote; use setData/refetch`);
    if (!(key in sync)) throw new Error(`@surgijs/store: unknown key "${key}"`);
    const prev = sync[key];
    if (Object.is(prev, value) || deepEqual(prev, value)) return false;
    sync[key] = value;
    return true;
  };

  const maybeReloadRemotes = (changedKey: string | Set<string>): void => {
    if (!remotes.size) return;
    for (const [name, entry] of remotes) {
      if (entry.refs <= 0) continue;
      if (entry.depKeys) {
        if (typeof changedKey === 'string') {
          if (!entry.depKeys.has(changedKey)) continue;
        } else {
          let hit = false;
          for (const k of changedKey) {
            if (entry.depKeys.has(k)) {
              hit = true;
              break;
            }
          }
          if (!hit) continue;
        }
      }
      const nextDeps = readDeps(entry);
      if (deepEqual(entry.key, nextDeps)) continue;
      const wait = entry.def.debounce ?? 0;
      if (wait > 0 && entry.key !== undefined) {
        clearTimer(entry);
        entry.ctrl?.abort();
        entry.ctrl = null;
        entry.seq++;
        entry.fetching = false;
        resetForDeps(entry);
        entry.key = nextDeps;
        bump();
        notifyKey(name);
        entry.timer = setTimeout(() => {
          entry.timer = null;
          if (entry.refs > 0) void load(name, entry, true).catch(() => {});
        }, wait);
        continue;
      }
      void load(name, entry, true).catch(() => {});
    }
  };

  const afterSyncWrite = (key: string): void => {
    bump();
    if (!restoring) maybeReloadRemotes(key);
    notifyKey(key);
    emit({ type: 'set', key });
  };

  const afterSyncWriteMany = (changed: Set<string>): void => {
    bump();
    if (!restoring) maybeReloadRemotes(changed);
    notifyKeys(changed);
    emit({ type: 'set' });
  };

  const forceLoad = (key: string): Promise<unknown> => {
    const entry = remotes.get(key);
    if (!entry) throw new Error(`@surgijs/store: "${key}" is not remote`);
    if (entry.gc) {
      clearTimeout(entry.gc);
      entry.gc = null;
    }
    return load(key, entry, true);
  };

  const store: Store<D> = {
    get: ((selector?: Selector<D, unknown>) => {
      if (!selector) return snapshot();
      return selector(snapshot());
    }) as Store<D>['get'],

    set(keyOrPartial: string | Record<string, unknown>, maybeValue?: unknown) {
      if (typeof keyOrPartial === 'string') {
        if (writeSync(keyOrPartial, maybeValue)) afterSyncWrite(keyOrPartial);
        return;
      }
      const changed = new Set<string>();
      for (const key of Object.keys(keyOrPartial)) {
        if (writeSync(key, keyOrPartial[key])) changed.add(key);
      }
      if (changed.size === 1) afterSyncWrite(changed.values().next().value!);
      else if (changed.size) afterSyncWriteMany(changed);
    },

    setData(key, value) {
      const name = key as string;
      const entry = remotes.get(name);
      if (!entry) throw new Error(`@surgijs/store: "${name}" is not remote`);
      const next =
        typeof value === 'function'
          ? (value as (prev: unknown) => unknown)(entry.data)
          : value;
      if (Object.is(entry.data, next) || deepEqual(entry.data, next)) return;
      entry.data = next;
      entry.source = 'optimistic';
      // Keep lastStatus so UI can stay on success/empty while optimistic.
      if (entry.lastStatus === undefined && next !== undefined) entry.lastStatus = 'success';
      bump();
      notifyKey(name);
      emit({ type: 'setData', key: name });
    },

    subscribe(selector, listener, options) {
      const equals = (options?.equals ?? deepEqual) as Equals<unknown>;
      const { value, keys } = trackSelect(selector);
      for (const name of keys) if (remotes.has(name)) retain(name);
      const sub: Sub<D> = {
        selector: selector as Selector<D, unknown>,
        listener: listener as Listener<unknown>,
        equals,
        value,
        keys,
      };
      subs.add(sub);
      indexSub(sub);
      if (options?.fireImmediately) listener(value as never, value as never);

      return () => {
        if (!subs.delete(sub)) return;
        unindexSub(sub);
        for (const name of sub.keys) if (remotes.has(name)) release(name);
      };
    },

    status(key) {
      const name = key as string;
      tracking?.add(name);
      const entry = remotes.get(name);
      if (!entry) throw new Error(`@surgijs/store: "${String(key)}" is not remote`);
      return snapshotStatus<RemoteData<D, typeof key>>(entry);
    },

    refetch(key) {
      return forceLoad(key as string) as Promise<RemoteData<D, typeof key> | undefined>;
    },

    prefetch(key) {
      return forceLoad(key as string) as Promise<RemoteData<D, typeof key> | undefined>;
    },

    write(fn) {
      return (...args) => {
        const get = ((keyOrSelector?: unknown) => {
          if (keyOrSelector === undefined) return store.get();
          if (typeof keyOrSelector === 'function') return store.get(keyOrSelector as Selector<D, unknown>);
          return store.get((s) => s[keyOrSelector as keyof StoreState<D>]);
        }) as Get<D>;
        fn(get, store.set as SetStore<D>, ...args);
      };
    },
  };

  const replace = (next: Record<string, unknown>): void => {
    quiet = true;
    restoring = true;
    try {
      const restored: [string, RemoteEntry][] = [];
      for (const [key, entry] of remotes) {
        if (!Object.prototype.hasOwnProperty.call(next, key)) continue;
        clearTimer(entry);
        entry.ctrl?.abort();
        entry.ctrl = null;
        entry.seq++;
        entry.fetching = false;
        restored.push([key, entry]);
      }
      const partial: Record<string, unknown> = {};
      for (const key of Object.keys(sync)) {
        if (Object.prototype.hasOwnProperty.call(next, key)) partial[key] = next[key];
      }
      if (Object.keys(partial).length) (store.set as (value: Record<string, unknown>) => void)(partial);
      for (const [key, entry] of restored) {
        store.setData(key as never, next[key] as never);
        entry.key = entry.dataKey = readDeps(entry);
        bump();
        notifyKey(key);
      }
    } finally {
      quiet = false;
      restoring = false;
    }
  };

  const dispatch = (action: Record<string, unknown>): void => {
    quiet = true;
    try {
      if (action.type === 'setData' && typeof action.key === 'string') store.setData(action.key as never, action.value as never);
      else if (action.type === 'set' && typeof action.key === 'string') store.set(action.key as never, action.value as never);
      else if (action.type === 'set' && action.payload && typeof action.payload === 'object' && !Array.isArray(action.payload))
        (store.set as (value: Record<string, unknown>) => void)(action.payload as Record<string, unknown>);
      else if (action.type == null) replace(action);
    } finally {
      quiet = false;
    }
    emit({ type: typeof action.type === 'string' ? action.type : 'dispatch', key: typeof action.key === 'string' ? action.key : undefined });
  };

  const send = connectDevtools({ get: () => snapshot() as Record<string, unknown>, replace, dispatch });
  emit = (action) => {
    if (!quiet && send) send(action);
  };

  return store;
}
