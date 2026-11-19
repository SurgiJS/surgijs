import type { Get, SetStore } from './action';
import { deepEqual } from './equal';
import { isRemoteError } from './http';
import { runMutation, type MutationContext } from './mutation';
import {
  DEFAULT_GC_TIME,
  createRemoteGet,
  isEmptyData,
  isRemote,
  type RemoteData,
  type RemoteDef,
  type RemoteKey,
  type RemoteKeys,
  type RemoteMeta,
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

export interface SendOptions extends RequestInit {
  /** Override URL. Defaults to the remote field's current `key` when it is a string. */
  url?: string;
  /** Refetch the remote field after a successful response. Default `true`. */
  refetch?: boolean;
}

type RemoteEntry = {
  def: RemoteDef<unknown>;
  data: unknown;
  error: unknown;
  fetching: boolean;
  /** Last settle outcome; success allows empty `null` / `[]`. */
  lastStatus: 'success' | 'error' | undefined;
  key: RemoteKey | undefined;
  /** Sync fields last read by `deps` — skip deps check when an unrelated key is set. */
  depKeys: Set<string> | null;
  refs: number;
  seq: number;
  ctrl: AbortController | null;
  /** Pending GC timer after the last subscriber leaves. */
  gc: ReturnType<typeof setTimeout> | null;
  dataUpdatedAt: number;
  errorUpdatedAt: number;
  fetchStartedAt: number;
  source: 'network' | 'cache' | undefined;
  httpStatus: number | undefined;
  code: string | number | undefined;
};

type Sub<D extends Record<string, unknown>> = {
  selector: Selector<D, unknown>;
  listener: Listener<unknown>;
  equals: Equals<unknown>;
  value: unknown;
  /** Top-level keys read by the selector (sync + remote). */
  keys: Set<string>;
};

export interface Store<D extends Record<string, unknown>> {
  /** Read the full state or a selected slice. Remote fields are `undefined` until watched and loaded. */
  get(): StoreState<D>;
  get<T>(selector: Selector<D, T>): T;

  /** Write sync fields. Deep-equal writes are no-ops. */
  set<K extends SyncKeys<D>>(key: K, value: D[K]): void;
  set(partial: Partial<{ [K in SyncKeys<D>]: D[K] }>): void;

  /**
   * Watch a selected slice. The first read of a `remote()` field loads it (or reuses
   * cache within `gcTime`). After the last unsubscribe, data stays until `gcTime`
   * (default 5 minutes) then unloads. Listener runs only when the selection fails
   * `equals` (default: deep equality).
   */
  subscribe<T>(selector: Selector<D, T>, listener: Listener<T>, options?: SubscribeOptions<T>): () => void;

  /**
   * UI status for a remote field (fetching, error, age, deps, TTL, …).
   * Reading this inside `subscribe` keeps the field loaded.
   */
  status<K extends RemoteKeys<D>>(key: K): RemoteMeta<RemoteData<D, K>>;

  /** Alias of `status`. */
  meta<K extends RemoteKeys<D>>(key: K): RemoteMeta<RemoteData<D, K>>;

  /** Force a remote field to reload (no-op when nothing watches it). */
  refetch<K extends RemoteKeys<D>>(key: K): Promise<RemoteData<D, K> | undefined>;

  /**
   * POST/PUT against a remote's string deps URL, then refetch by default.
   * Prefer `mutation()` for create/update flows with UI status.
   */
  send<K extends RemoteKeys<D>>(key: K, init?: SendOptions): Promise<Response>;

  /**
   * Bind a jotai-style writer to this store:
   * `store.write((get, set, by) => set('count', get('count') * by))(2)`.
   */
  write<A extends unknown[]>(fn: (get: Get<D>, set: SetStore<D>, ...args: A) => void): (...args: A) => void;

  /**
   * One-off server write (create user, etc.) with get/set/refetch/report.
   * For reusable mutations with status, use `mutation()` from `@surgijs/store`.
   */
  mutate<R>(fn: (ctx: MutationContext<D>) => R | PromiseLike<R>): Promise<R>;
}

export interface CreateStoreOptions {
  /**
   * Default `gcTime` for `remote()` fields that omit it.
   * `0` unloads immediately; `Infinity` keeps forever. Default: 5 minutes.
   */
  gcTime?: number;
}

export function createStore<D extends Record<string, unknown>>(def: D, options?: CreateStoreOptions): Store<D> {
  const defaultGc = options?.gcTime ?? DEFAULT_GC_TIME;
  const sync: Record<string, unknown> = Object.create(null);
  const remotes = new Map<string, RemoteEntry>();
  const subs = new Set<Sub<D>>();
  /** Subscribers indexed by top-level key they read. */
  const byKey = new Map<string, Set<Sub<D>>>();
  let version = 0;
  let view: StoreState<D> | undefined;
  let viewVersion = -1;
  let tracking: Set<string> | null = null;
  let notifying = false;
  /** Queued keys while already notifying (boxed so nested writes can mutate). */
  const pending = { keys: null as Set<string> | null, one: null as string | null };

  for (const key of Object.keys(def)) {
    const value = def[key];
    if (isRemote(value)) {
      remotes.set(key, {
        def: { ...value, gcTime: value.gcTime ?? defaultGc },
        data: undefined,
        error: undefined,
        fetching: false,
        lastStatus: undefined,
        key: undefined,
        depKeys: null,
        refs: 0,
        seq: 0,
        ctrl: null,
        gc: null,
        dataUpdatedAt: 0,
        errorUpdatedAt: 0,
        fetchStartedAt: 0,
        source: undefined,
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

  const flushSub = (sub: Sub<D>, state: StoreState<D>): void => {
    const value = sub.selector(state);
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

  const notifyKey = (key: string): void => {
    if (notifying) {
      queueKey(key);
      return;
    }
    notifying = true;
    try {
      let one: string | null = key;
      do {
        const k = one;
        one = null;
        pending.one = null;
        pending.keys = null;
        const state = snapshot();
        const set = byKey.get(k!);
        if (set) for (const sub of set) flushSub(sub, state);
        // Nested set() may queue into `pending` during flushSub.
        const queued = pending.keys as Set<string> | null;
        const nextOne = pending.one as string | null;
        pending.keys = null;
        pending.one = null;
        if (queued) {
          const state2 = snapshot();
          const seen = new Set<Sub<D>>();
          for (const key2 of queued) {
            const group = byKey.get(key2);
            if (!group) continue;
            for (const sub of group) {
              if (seen.has(sub)) continue;
              seen.add(sub);
              flushSub(sub, state2);
            }
          }
        } else if (nextOne) one = nextOne;
      } while (one);
    } finally {
      notifying = false;
      pending.one = null;
      pending.keys = null;
    }
  };

  const notifyKeys = (changed: Set<string>): void => {
    if (changed.size === 1) {
      notifyKey(changed.values().next().value!);
      return;
    }
    if (notifying) {
      if (!pending.keys) pending.keys = new Set(changed);
      else for (const k of changed) pending.keys.add(k);
      return;
    }
    notifying = true;
    try {
      let batch: Set<string> | null = changed;
      do {
        const keys = batch!;
        batch = null;
        pending.keys = null;
        const state = snapshot();
        const seen = new Set<Sub<D>>();
        for (const key of keys) {
          const set = byKey.get(key);
          if (!set) continue;
          for (const sub of set) {
            if (seen.has(sub)) continue;
            seen.add(sub);
            flushSub(sub, state);
          }
        }
        batch = pending.keys as Set<string> | null;
      } while (batch);
    } finally {
      notifying = false;
      pending.keys = null;
    }
  };

  const unload = (name: string, entry: RemoteEntry): void => {
    if (entry.gc) {
      clearTimeout(entry.gc);
      entry.gc = null;
    }
    entry.ctrl?.abort();
    entry.ctrl = null;
    entry.seq++;
    entry.data = undefined;
    entry.error = undefined;
    entry.fetching = false;
    entry.lastStatus = undefined;
    entry.key = undefined;
    entry.depKeys = null;
    entry.dataUpdatedAt = 0;
    entry.errorUpdatedAt = 0;
    entry.fetchStartedAt = 0;
    entry.source = undefined;
    entry.httpStatus = undefined;
    entry.code = undefined;
    bump();
    notifyKey(name);
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
    const hasData = entry.dataUpdatedAt > 0;
    const isPending = isFetching && entry.lastStatus === undefined;
    const status = isPending ? 'pending' : isError ? 'error' : isSuccess ? 'success' : 'idle';
    const gcTime = entry.def.gcTime ?? DEFAULT_GC_TIME;
    const dataUpdatedAt = entry.dataUpdatedAt;
    return {
      data: entry.data as T | undefined,
      error: entry.error,
      status,
      isFetching,
      isPending,
      isLoading: isPending,
      isSuccess,
      isError,
      isEmpty: isSuccess && isEmptyData(entry.data),
      hasData,
      isActive: entry.refs > 0,
      deps: entry.key,
      key: entry.key,
      source: entry.source,
      httpStatus: entry.httpStatus,
      code: entry.code,
      dataUpdatedAt,
      errorUpdatedAt: entry.errorUpdatedAt,
      fetchStartedAt: entry.fetchStartedAt,
      age: dataUpdatedAt ? Date.now() - dataUpdatedAt : null,
      gcTime,
      observers: entry.refs,
      loading: isFetching,
    };
  };

  const load = (name: string, entry: RemoteEntry, force: boolean): Promise<unknown> => {
    // Only re-fetch when deps change (or forced) — unrelated store writes skip fetch.
    const nextDeps = readDeps(entry);
    if (
      !force &&
      deepEqual(entry.key, nextDeps) &&
      (entry.fetching || entry.lastStatus !== undefined)
    ) {
      if (!entry.fetching && entry.lastStatus === 'success') entry.source = entry.source ?? 'cache';
      return Promise.resolve(entry.data);
    }

    entry.ctrl?.abort();
    const ctrl = new AbortController();
    entry.ctrl = ctrl;
    entry.key = nextDeps;
    entry.fetching = true;
    entry.fetchStartedAt = Date.now();
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

    let result: unknown;
    try {
      result = entry.def.fetch(get, {
        signal: ctrl.signal,
        deps: nextDeps,
        key: nextDeps,
        get,
        report,
      });
    } catch (err) {
      if (seq !== entry.seq) return Promise.resolve(entry.data);
      entry.fetching = false;
      entry.error = err;
      entry.lastStatus = 'error';
      entry.errorUpdatedAt = Date.now();
      entry.source = 'network';
      applyErrorMeta(entry, err);
      bump();
      notifyKey(name);
      return Promise.reject(err);
    }

    return Promise.resolve(result).then(
      (data) => {
        if (seq !== entry.seq) return entry.data;
        entry.fetching = false;
        entry.error = undefined;
        entry.lastStatus = 'success';
        // Allow null / [] as real empty success (do not treat as “no data”).
        entry.data = data;
        entry.dataUpdatedAt = Date.now();
        entry.source = 'network';
        if (entry.httpStatus === undefined) entry.httpStatus = 200;
        bump();
        notifyKey(name);
        return entry.data;
      },
      (err) => {
        if (seq !== entry.seq || (err && typeof err === 'object' && (err as { name?: string }).name === 'AbortError')) {
          return entry.data;
        }
        entry.fetching = false;
        entry.error = err;
        entry.lastStatus = 'error';
        entry.errorUpdatedAt = Date.now();
        entry.source = 'network';
        applyErrorMeta(entry, err);
        bump();
        notifyKey(name);
        throw err;
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
    if (entry.refs === 1) void load(name, entry, false).catch(() => {});
  };

  const release = (name: string): void => {
    const entry = remotes.get(name);
    if (!entry || entry.refs <= 0) return;
    entry.refs--;
    if (entry.refs !== 0) return;

    // Nobody watching: drop in-flight work, keep completed cache for gcTime.
    if (entry.fetching) {
      entry.ctrl?.abort();
      entry.ctrl = null;
      entry.seq++;
      entry.fetching = false;
      bump();
      notifyKey(name);
    }

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

  const write = (key: string, value: unknown): boolean => {
    if (remotes.has(key)) throw new Error(`@surgijs/store: "${key}" is remote; use refetch/send`);
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
      if (!deepEqual(entry.key, nextDeps)) void load(name, entry, true).catch(() => {});
    }
  };

  const afterSyncWrite = (key: string): void => {
    bump();
    maybeReloadRemotes(key);
    notifyKey(key);
  };

  const afterSyncWriteMany = (changed: Set<string>): void => {
    bump();
    maybeReloadRemotes(changed);
    notifyKeys(changed);
  };

  const store: Store<D> = {
    get: ((selector?: Selector<D, unknown>) => {
      if (!selector) return snapshot();
      return selector(snapshot());
    }) as Store<D>['get'],

    set(keyOrPartial: string | Record<string, unknown>, maybeValue?: unknown) {
      if (typeof keyOrPartial === 'string') {
        if (write(keyOrPartial, maybeValue)) afterSyncWrite(keyOrPartial);
        return;
      }
      const changed = new Set<string>();
      for (const key of Object.keys(keyOrPartial)) {
        if (write(key, keyOrPartial[key])) changed.add(key);
      }
      if (changed.size === 1) afterSyncWrite(changed.values().next().value!);
      else if (changed.size) afterSyncWriteMany(changed);
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

    meta(key) {
      return store.status(key);
    },

    refetch(key) {
      const entry = remotes.get(key as string);
      if (!entry) throw new Error(`@surgijs/store: "${String(key)}" is not remote`);
      if (entry.refs <= 0) return Promise.resolve(undefined as RemoteData<D, typeof key> | undefined);
      return load(key as string, entry, true) as Promise<RemoteData<D, typeof key> | undefined>;
    },

    async send(key, init = {}) {
      const entry = remotes.get(key as string);
      if (!entry) throw new Error(`@surgijs/store: "${String(key)}" is not remote`);
      const { url, refetch: shouldRefetch = true, ...request } = init;
      const target = url ?? (typeof entry.key === 'string' ? entry.key : undefined);
      if (target == null) {
        throw new Error(`@surgijs/store: send("${String(key)}") needs a string deps value or url`);
      }
      const response = await fetch(target, request);
      if (!response.ok) throw new Error(`@surgijs/store: send("${String(key)}") failed: ${response.status}`);
      if (shouldRefetch && entry.refs > 0) await load(key as string, entry, true);
      return response;
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

    mutate(fn) {
      return runMutation(store, fn);
    },
  };

  return store;
}
