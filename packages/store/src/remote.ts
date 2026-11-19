export const REMOTE = Symbol.for('surgijs.store.remote');

/** Default remote GC: unload 5 minutes after the last subscriber leaves. */
export const DEFAULT_GC_TIME = 5 * 60 * 1000;

export type RemoteKey = string | number | boolean | null | undefined | bigint | symbol | object;

/**
 * Read sync store fields while computing `deps` / `fetch`.
 * Callable as `get('field')`, `get(s => s.field)`, `get()`, and also as
 * a state object: `get.windowLocation`.
 */
export type RemoteGet = ((
  keyOrSelector?: string | ((state: Record<string, unknown>) => unknown),
) => unknown) &
  Record<string, unknown>;

export interface RemoteReport {
  /** HTTP status (200, 404, …). */
  status?: number;
  /** App or HTTP error code. */
  code?: string | number;
}

export interface RemoteContext {
  signal: AbortSignal;
  /** Current `deps(get)` value for this load. */
  deps: RemoteKey;
  /** @deprecated Same as `deps` (kept for older examples). */
  key: RemoteKey;
  /** Same reader as the first `fetch` argument. */
  get: RemoteGet;
  /** Attach HTTP / app codes to `store.status(...)` while the request runs. */
  report: (info: RemoteReport) => void;
}

type DepsFn = (get: RemoteGet) => RemoteKey;

export interface RemoteOptions<T> {
  /**
   * When this value changes (deep equality) while the field is watched, `fetch`
   * runs again. Unrelated store writes do **not** call `fetch`.
   *
   * ```ts
   * deps: (get) => [get.windowLocation, get.windowQueryParams]
   * ```
   */
  deps: DepsFn;
  /**
   * Alias of `deps` (same behavior). Prefer `deps`.
   * @deprecated Use `deps`.
   */
  key?: DepsFn;
  /**
   * Loads data. Called on first watch and when `deps` changes — not on every
   * store write. Read the store with `get` inside.
   */
  fetch: (get: RemoteGet, ctx: RemoteContext) => T | PromiseLike<T>;
  /**
   * Keep unused remote data in memory this long after the last subscriber leaves.
   * `0` unloads immediately; `Infinity` keeps forever.
   * Omit to use `createStore(..., { gcTime })` or the 5-minute default.
   */
  gcTime?: number;
}

/** Accept `deps` or legacy `key`. */
export type RemoteOptionsInput<T> = Omit<RemoteOptions<T>, 'deps' | 'key'> &
  (
    | { deps: DepsFn; key?: DepsFn }
    | { deps?: DepsFn; key: DepsFn }
  );

export interface RemoteDef<T> {
  readonly [REMOTE]: true;
  readonly deps: DepsFn;
  readonly fetch: RemoteOptions<T>['fetch'];
  /** Explicit override; `undefined` means “use store / default”. */
  readonly gcTime?: number;
}

export function remote<T>(options: RemoteOptionsInput<T>): RemoteDef<T> {
  const deps = options.deps ?? options.key;
  if (!deps) throw new Error('@surgijs/store: remote() needs deps (or key)');
  return {
    [REMOTE]: true,
    deps,
    fetch: options.fetch,
    gcTime: options.gcTime,
  };
}

export function isRemote(value: unknown): value is RemoteDef<unknown> {
  return !!value && typeof value === 'object' && (value as RemoteDef<unknown>)[REMOTE] === true;
}

/**
 * Build a `RemoteGet` over a sync-state snapshot.
 * When `tracked` is passed, records every sync field read (for skipping
 * remote deps checks on unrelated `set` calls).
 */
export function createRemoteGet(state: Record<string, unknown>, tracked?: Set<string>): RemoteGet {
  const touch = (prop: string): void => {
    tracked?.add(prop);
  };

  const read = ((keyOrSelector?: unknown) => {
    if (keyOrSelector === undefined) {
      if (tracked) for (const k of Object.keys(state)) tracked.add(k);
      return state;
    }
    if (typeof keyOrSelector === 'function') {
      const sel = keyOrSelector as (s: Record<string, unknown>) => unknown;
      if (!tracked) return sel(state);
      const proxy = new Proxy(state, {
        get(t, prop, receiver) {
          if (typeof prop === 'string') touch(prop);
          return Reflect.get(t, prop, receiver);
        },
        ownKeys: (t) => {
          for (const k of Reflect.ownKeys(t)) if (typeof k === 'string') touch(k);
          return Reflect.ownKeys(t);
        },
      });
      return sel(proxy);
    }
    touch(keyOrSelector as string);
    return state[keyOrSelector as string];
  }) as RemoteGet;

  return new Proxy(read as object, {
    apply(_t, _thisArg, args) {
      return Reflect.apply(read as (...a: unknown[]) => unknown, undefined, args);
    },
    get(_t, prop, receiver) {
      if (typeof prop === 'symbol') return Reflect.get(read, prop, receiver);
      if (Object.prototype.hasOwnProperty.call(state, prop) || prop in state) {
        touch(prop as string);
        return state[prop as string];
      }
      return Reflect.get(read, prop, receiver);
    },
    has(_t, prop) {
      if (typeof prop === 'string') return prop in state;
      return Reflect.has(read, prop);
    },
    ownKeys: () => Reflect.ownKeys(state),
    getOwnPropertyDescriptor(_t, prop) {
      if (typeof prop === 'string' && prop in state) {
        touch(prop);
        return { configurable: true, enumerable: true, writable: false, value: state[prop] };
      }
      return Reflect.getOwnPropertyDescriptor(read, prop);
    },
  }) as RemoteGet;
}

export type UnwrapDef<T> = T extends RemoteDef<infer U> ? U | undefined : T;

export type StoreState<D extends Record<string, unknown>> = {
  readonly [K in keyof D]: UnwrapDef<D[K]>;
};

export type SyncKeys<D extends Record<string, unknown>> = {
  [K in keyof D]-?: D[K] extends RemoteDef<unknown> ? never : K;
}[keyof D];

export type RemoteKeys<D extends Record<string, unknown>> = {
  [K in keyof D]-?: D[K] extends RemoteDef<unknown> ? K : never;
}[keyof D];

export type RemoteData<D extends Record<string, unknown>, K extends RemoteKeys<D>> =
  D[K] extends RemoteDef<infer U> ? U : never;

/** High-level remote lifecycle for UI. */
export type RemotePhase = 'idle' | 'pending' | 'success' | 'error';

/** Where the current `data` came from. */
export type RemoteSource = 'network' | 'cache' | undefined;

/**
 * Snapshot of a remote field for UI status (spinners, errors, stale hints).
 * Built fresh on each `store.status(name)` / `store.meta(name)` call.
 *
 * Empty success (`null` / `[]` / `''`) is **not** an error — use `isEmpty`.
 * HTTP 404 and `200 + { ok: false }` land in `isError` with `httpStatus` / `code`.
 */
export interface RemoteMeta<T> {
  /** Last successful payload. `undefined` = never loaded; `null` / `[]` = empty success. */
  data: T | undefined;
  error: unknown;

  /** `idle` | `pending` (no settle yet) | `success` | `error`. */
  status: RemotePhase;
  /** True while a request is in flight (including background refetch). */
  isFetching: boolean;
  /** First load: fetching and never settled successfully. */
  isPending: boolean;
  /** Alias of `isPending`. */
  isLoading: boolean;
  /** Last settle was success (including empty body). */
  isSuccess: boolean;
  /** Last settle was error (404, network, or 200+error body). Previous `data` may remain. */
  isError: boolean;
  /** Success with empty payload (`null`, `[]`, or `''`). */
  isEmpty: boolean;
  /** At least one successful settle exists (`data` may be empty). */
  hasData: boolean;
  /** At least one subscriber is keeping this field alive. */
  isActive: boolean;

  /** Last `deps(get)` identity. */
  deps: RemoteKey | undefined;
  /** @deprecated Same as `deps`. */
  key: RemoteKey | undefined;
  /** `network` after a fetch, `cache` when reused without a new request. */
  source: RemoteSource;

  /** HTTP status of the last report / error (`200`, `404`, …). */
  httpStatus: number | undefined;
  /** App or HTTP error code from `RemoteError` / `report()`. */
  code: string | number | undefined;

  /** Epoch ms of last successful data write (`0` if never). */
  dataUpdatedAt: number;
  /** Epoch ms of last error (`0` if none). */
  errorUpdatedAt: number;
  /** Epoch ms when the current (or last) fetch started (`0` if never). */
  fetchStartedAt: number;
  /** `Date.now() - dataUpdatedAt`, or `null` if never successfully loaded. */
  age: number | null;

  /** GC TTL for this field (ms). */
  gcTime: number;
  /** Active subscriber count for this remote. */
  observers: number;

  /** @deprecated Use `isFetching`. */
  loading: boolean;
}

export function isEmptyData(data: unknown): boolean {
  return data == null || data === '' || (Array.isArray(data) && data.length === 0);
}
