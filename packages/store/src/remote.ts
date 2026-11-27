export const REMOTE = Symbol.for('surgijs.store.remote');

/** Default remote GC: unload 5 minutes after the last subscriber leaves. */
export const DEFAULT_GC_TIME = 5 * 60 * 1000;

/** Default: data is immediately stale (refetch on remount / focus when enabled). */
export const DEFAULT_STALE_TIME = 0;

export type RemoteKey = string | number | boolean | null | undefined | bigint | symbol | object;

/**
 * Read sync store fields while computing `deps` / `fetch`.
 * Callable as `get('field')`, `get(s => s.field)`, `get()`, and also as
 * a state object: `get.windowLocation`.
 */
export type RemoteGet<S extends object = Record<string, unknown>> = {
  (): S;
  <K extends keyof S>(key: K): S[K];
  <T>(selector: (state: S) => T): T;
} & Readonly<S>;

export interface RemoteReport {
  /** HTTP status (200, 404, …). */
  status?: number;
  /** App or HTTP error code. */
  code?: string | number;
}

export interface RemoteContext<S extends object = Record<string, unknown>, K = RemoteKey> {
  signal: AbortSignal;
  /** Current `deps(get)` value for this load. */
  deps: K;
  /** Same reader as the first `fetch` argument. */
  get: RemoteGet<S>;
  /** Attach HTTP / app codes to `store.status(...)` while the request runs. */
  report: (info: RemoteReport) => void;
}

type DepsFn = (get: RemoteGet) => RemoteKey;

/** `K` is inferred as a tuple when `deps` returns an array literal. */
type DepsKey = {} | null | undefined | readonly [];

export type RetryDelay = number | ((attempt: number, error: unknown) => number);

export interface RemoteOptions<T, S extends object = Record<string, unknown>, K = RemoteKey> {
  /**
   * When this value changes (deep equality) while the field is watched, `fetch`
   * runs again. Unrelated store writes do **not** call `fetch`.
   *
   * ```ts
   * deps: (get) => [get.windowLocation, get.windowQueryParams]
   * ```
   */
  deps: (get: RemoteGet<S>) => K;
  /**
   * Loads data. Called on first watch and when `deps` change / stale — not on every
   * store write. Read the store with `get` inside.
   */
  fetch: (get: RemoteGet<S>, ctx: RemoteContext<S, K>) => T | PromiseLike<T>;
  /**
   * Keep unused remote data in memory this long after the last subscriber leaves.
   * `0` unloads immediately; `Infinity` keeps forever.
   * Omit to use `createStore(..., { gcTime })` or the 5-minute default.
   */
  gcTime?: number;
  /**
   * How long successful data stays fresh (ms). Fresh data skips remount/focus refetch.
   * `0` (default) = always stale. `Infinity` = never auto-refetch while cached.
   */
  staleTime?: number;
  /**
   * Retry failed fetches. `false` / `0` = no retry. Number = max attempts after the first try.
   * Default `2` (up to 3 total tries).
   */
  retry?: number | false;
  /** Delay between retries. Number or `(attempt, error) => ms`. Default exponential backoff. */
  retryDelay?: RetryDelay;
  /** Refetch stale watched fields when the tab becomes visible. Default `true`. */
  refetchOnFocus?: boolean;
  /** Refetch stale watched fields when the browser comes online. Default `true`. */
  refetchOnReconnect?: boolean;
  /** Seed data before the first successful fetch (shown while pending). */
  placeholderData?: T | (() => T);
  /**
   * Wait this many ms after `deps` change before calling `fetch`, so typing in a
   * search box makes one request. The first load is never delayed.
   */
  debounce?: number;
  /**
   * What `data` shows while new `deps` load. Default `false`: data resets to
   * `placeholderData` (or `undefined`) and `status` is `pending`, so a field never
   * shows data that belongs to other deps. `true` keeps the previous data and sets
   * `status(...).isPreviousData`.
   */
  keepPreviousData?: boolean;
}

export interface RemoteDef<T> {
  readonly [REMOTE]: true;
  readonly deps: DepsFn;
  readonly fetch: RemoteOptions<T>['fetch'];
  readonly gcTime?: number;
  readonly staleTime?: number;
  /** `undefined` until `createStore` fills it from its options. */
  readonly retry?: number;
  readonly retryDelay?: RetryDelay;
  readonly refetchOnFocus?: boolean;
  readonly refetchOnReconnect?: boolean;
  readonly placeholderData?: T | (() => T);
  readonly debounce?: number;
  readonly keepPreviousData?: boolean;
}

export function defaultRetryDelay(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, 30_000);
}

export function remote<T, K extends DepsKey = RemoteKey>(options: RemoteOptions<T, Record<string, unknown>, K>): RemoteDef<T> {
  if (!options.deps) throw new Error('@surgijs/store: remote() needs deps');
  return {
    [REMOTE]: true,
    deps: options.deps as RemoteDef<T>['deps'],
    fetch: options.fetch as RemoteDef<T>['fetch'],
    gcTime: options.gcTime,
    staleTime: options.staleTime,
    retry: options.retry === undefined ? undefined : options.retry === false ? 0 : options.retry,
    retryDelay: options.retryDelay,
    refetchOnFocus: options.refetchOnFocus,
    refetchOnReconnect: options.refetchOnReconnect,
    placeholderData: options.placeholderData,
    debounce: options.debounce,
    keepPreviousData: options.keepPreviousData,
  };
}

/**
 * `remote` with typed reads of the sync state: `get.cityId` and `get('cityId')` get
 * their real types, and `ctx.deps` has the type `deps` returns.
 *
 * ```ts
 * type State = { cityId: number };
 * const remote = createRemote<State>();
 * const store = createStore({
 *   cityId: 1,
 *   weather: remote({
 *     deps: (get) => [get.cityId] as const,
 *     fetch: async (get, { deps: [cityId] }) => loadWeather(cityId),
 *   }),
 * });
 * ```
 */
export function createRemote<S extends object>(): <T, K extends DepsKey = RemoteKey>(
  options: RemoteOptions<T, S, K>,
) => RemoteDef<T> {
  return remote as never;
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

/**
 * Single UI discriminator for `store.status(name).status`.
 * Priority: `err` > `pending` > `empty` > `success`.
 * Background refetch keeps last settle; use `isFetching` for a spinner overlay.
 */
export type RemotePhase = 'pending' | 'success' | 'empty' | 'err';

/** Where the current `data` came from. */
export type RemoteSource = 'network' | 'cache' | 'optimistic' | undefined;

/**
 * Snapshot of a remote field for UI status (spinners, errors, stale hints).
 * Built fresh on each `store.status(name)` call.
 *
 * Empty success (`null` / `[]` / `''`) is **not** an error — use `isEmpty` / `status === 'empty'`.
 * HTTP 404 and `200 + { ok: false }` land in `isError` / `status === 'err'` with `httpStatus` / `code`.
 */
export interface RemoteMeta<T> {
  /** Last successful / optimistic / placeholder payload. */
  data: T | undefined;
  error: unknown;

  /** One place for UI: `'pending' | 'success' | 'empty' | 'err'`. */
  status: RemotePhase;
  /** True while a request is in flight (including background refetch). */
  isFetching: boolean;
  /** First load: fetching and never settled successfully. */
  isPending: boolean;
  /** Last settle was success (including empty body). */
  isSuccess: boolean;
  /** Last settle was error. Previous `data` may remain. */
  isError: boolean;
  /** Success with empty payload (`null`, `[]`, or `''`). */
  isEmpty: boolean;
  /** Fresh vs past `staleTime` (false while never loaded). */
  isStale: boolean;
  /** At least one subscriber is keeping this field alive. */
  isActive: boolean;

  /** Last `deps(get)` identity. */
  deps: RemoteKey | undefined;
  /** The `deps` the current `data` was fetched for; compare with `deps` to detect stale data. */
  dataDeps: RemoteKey | undefined;
  /** `keepPreviousData` is on and `data` still belongs to older `deps` than `deps`. */
  isPreviousData: boolean;
  /** `network` | `cache` | `optimistic`. */
  source: RemoteSource;

  /** HTTP status of the last report / error (`200`, `404`, …). */
  httpStatus: number | undefined;
  /** App or HTTP error code from `RemoteError` / `report()`. */
  code: string | number | undefined;

  /** Epoch ms of last successful data write (`0` if never). */
  dataUpdatedAt: number;
  /** `Date.now() - dataUpdatedAt`, or `null` if never successfully loaded. */
  age: number | null;

  /** GC TTL for this field (ms). */
  gcTime: number;
  /** Freshness window (ms). */
  staleTime: number;
}

export function isEmptyData(data: unknown): boolean {
  return data == null || data === '' || (Array.isArray(data) && data.length === 0);
}

export function resolvePlaceholder<T>(value: T | (() => T) | undefined): T | undefined {
  if (value === undefined) return undefined;
  return typeof value === 'function' ? (value as () => T)() : value;
}
