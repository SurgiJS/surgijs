export const REMOTE = Symbol.for('surgijs.store.remote');

/** Default remote GC: unload 5 minutes after the last subscriber leaves. */
export const DEFAULT_GC_TIME = 5 * 60 * 1000;

export type RemoteKey = string | number | boolean | null | undefined | bigint | symbol | object;

/**
 * Read sync store fields while computing a remote `key` / `fetch`.
 * Callable as `get('field')`, `get(s => s.field)`, `get()`, and also as
 * a state object: `get.windowLocation` (so existing `(s) => s.q` keeps working).
 */
export type RemoteGet = ((
  keyOrSelector?: string | ((state: Record<string, unknown>) => unknown),
) => unknown) &
  Record<string, unknown>;

export interface RemoteContext {
  signal: AbortSignal;
  /** Result of `key(get)` for this load. */
  key: RemoteKey;
  /** Same reader as the first `fetch` argument. */
  get: RemoteGet;
}

export interface RemoteOptions<T> {
  /**
   * Cache identity and dependency list. Re-runs when watched; if the value
   * changes, `fetch` runs again. Read store fields via `get` / property access:
   * `key: (get) => [get.windowLocation, get.windowQueryParams]`.
   */
  key: (get: RemoteGet) => RemoteKey;
  /**
   * Loads data. Receives `get` to read the store (same fields as `key`).
   * Prefer putting dependencies in `key` so location/query changes refetch.
   */
  fetch: (get: RemoteGet, ctx: RemoteContext) => T | PromiseLike<T>;
  /**
   * Keep unused remote data in memory this long after the last subscriber leaves.
   * `0` unloads immediately; `Infinity` keeps forever.
   * Omit to use `createStore(..., { gcTime })` or the 5-minute default.
   */
  gcTime?: number;
}

export interface RemoteDef<T> {
  readonly [REMOTE]: true;
  readonly key: RemoteOptions<T>['key'];
  readonly fetch: RemoteOptions<T>['fetch'];
  /** Explicit override; `undefined` means “use store / default”. */
  readonly gcTime?: number;
}

export function remote<T>(options: RemoteOptions<T>): RemoteDef<T> {
  return {
    [REMOTE]: true,
    key: options.key,
    fetch: options.fetch,
    gcTime: options.gcTime,
  };
}

export function isRemote(value: unknown): value is RemoteDef<unknown> {
  return !!value && typeof value === 'object' && (value as RemoteDef<unknown>)[REMOTE] === true;
}

/** Build a `RemoteGet` over a sync-state snapshot. */
export function createRemoteGet(state: Record<string, unknown>): RemoteGet {
  const read = ((keyOrSelector?: unknown) => {
    if (keyOrSelector === undefined) return state;
    if (typeof keyOrSelector === 'function') return (keyOrSelector as (s: Record<string, unknown>) => unknown)(state);
    return state[keyOrSelector as string];
  }) as RemoteGet;

  return new Proxy(read as object, {
    apply(_t, _thisArg, args) {
      return Reflect.apply(read as (...a: unknown[]) => unknown, undefined, args);
    },
    get(_t, prop, receiver) {
      if (typeof prop === 'symbol') return Reflect.get(read, prop, receiver);
      if (Object.prototype.hasOwnProperty.call(state, prop) || prop in state) return state[prop as string];
      return Reflect.get(read, prop, receiver);
    },
    has(_t, prop) {
      if (typeof prop === 'string') return prop in state;
      return Reflect.has(read, prop);
    },
    ownKeys: () => Reflect.ownKeys(state),
    getOwnPropertyDescriptor(_t, prop) {
      if (typeof prop === 'string' && prop in state) {
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

export interface RemoteMeta<T> {
  data: T | undefined;
  loading: boolean;
  error: unknown;
  key: RemoteKey | undefined;
}
