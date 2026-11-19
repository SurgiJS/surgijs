import type { Get, SetStore } from './action';
import { deepEqual } from './equal';
import {
  DEFAULT_GC_TIME,
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
  loading: boolean;
  key: RemoteKey | undefined;
  refs: number;
  seq: number;
  ctrl: AbortController | null;
  /** Pending GC timer after the last subscriber leaves. */
  gc: ReturnType<typeof setTimeout> | null;
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

  /** Status of a remote field. Reading this inside `subscribe` keeps the field loaded. */
  meta<K extends RemoteKeys<D>>(key: K): RemoteMeta<RemoteData<D, K>>;

  /** Force a remote field to reload (no-op when nothing watches it). */
  refetch<K extends RemoteKeys<D>>(key: K): Promise<RemoteData<D, K> | undefined>;

  /**
   * Send a request, then refetch the remote field by default.
   * URL defaults to the field's current string `key`.
   */
  send<K extends RemoteKeys<D>>(key: K, init?: SendOptions): Promise<Response>;

  /**
   * Bind a jotai-style writer to this store:
   * `store.write((get, set, by) => set('count', get('count') * by))(2)`.
   */
  write<A extends unknown[]>(fn: (get: Get<D>, set: SetStore<D>, ...args: A) => void): (...args: A) => void;
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
        loading: false,
        key: undefined,
        refs: 0,
        seq: 0,
        ctrl: null,
        gc: null,
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
    entry.loading = false;
    entry.key = undefined;
    bump();
    notifyKey(name);
  };

  const load = (name: string, entry: RemoteEntry, force: boolean): Promise<unknown> => {
    const nextKey = entry.def.key(syncState());
    if (
      !force &&
      deepEqual(entry.key, nextKey) &&
      (entry.loading || entry.data !== undefined || entry.error !== undefined)
    ) {
      return Promise.resolve(entry.data);
    }

    entry.ctrl?.abort();
    const ctrl = new AbortController();
    entry.ctrl = ctrl;
    entry.key = nextKey;
    entry.loading = true;
    entry.error = undefined;
    const seq = ++entry.seq;
    bump();
    notifyKey(name);

    let result: unknown;
    try {
      result = entry.def.fetch(nextKey, { signal: ctrl.signal });
    } catch (err) {
      if (seq !== entry.seq) return Promise.resolve(entry.data);
      entry.loading = false;
      entry.error = err;
      bump();
      notifyKey(name);
      return Promise.reject(err);
    }

    return Promise.resolve(result).then(
      (data) => {
        if (seq !== entry.seq) return entry.data;
        entry.loading = false;
        entry.error = undefined;
        if (!deepEqual(entry.data, data)) entry.data = data;
        bump();
        notifyKey(name);
        return entry.data;
      },
      (err) => {
        if (seq !== entry.seq || (err && typeof err === 'object' && (err as { name?: string }).name === 'AbortError')) {
          return entry.data;
        }
        entry.loading = false;
        entry.error = err;
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
    if (entry.refs === 1) void load(name, entry, false);
  };

  const release = (name: string): void => {
    const entry = remotes.get(name);
    if (!entry || entry.refs <= 0) return;
    entry.refs--;
    if (entry.refs !== 0) return;

    // Nobody watching: drop in-flight work, keep completed cache for gcTime.
    if (entry.loading) {
      entry.ctrl?.abort();
      entry.ctrl = null;
      entry.seq++;
      entry.loading = false;
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

  const afterSyncWrite = (key: string): void => {
    bump();
    if (remotes.size) {
      for (const [name, entry] of remotes) {
        if (entry.refs <= 0) continue;
        const nextKey = entry.def.key(syncState());
        if (!deepEqual(entry.key, nextKey)) void load(name, entry, true);
      }
    }
    notifyKey(key);
  };

  const afterSyncWriteMany = (changed: Set<string>): void => {
    bump();
    if (remotes.size) {
      for (const [name, entry] of remotes) {
        if (entry.refs <= 0) continue;
        const nextKey = entry.def.key(syncState());
        if (!deepEqual(entry.key, nextKey)) void load(name, entry, true);
      }
    }
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

    meta(key) {
      const name = key as string;
      tracking?.add(name);
      const entry = remotes.get(name);
      if (!entry) throw new Error(`@surgijs/store: "${String(key)}" is not remote`);
      return {
        data: entry.data,
        loading: entry.loading,
        error: entry.error,
        key: entry.key,
      } as RemoteMeta<RemoteData<D, typeof key>>;
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
      if (target == null) throw new Error(`@surgijs/store: send("${String(key)}") needs a string key or url`);
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
  };

  return store;
}
