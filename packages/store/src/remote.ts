export const REMOTE = Symbol.for('surgijs.store.remote');

/** Default remote GC: unload 5 minutes after the last subscriber leaves. */
export const DEFAULT_GC_TIME = 5 * 60 * 1000;

export type RemoteKey = string | number | boolean | null | undefined | bigint | symbol | object;

export interface RemoteContext {
  signal: AbortSignal;
}

export interface RemoteOptions<T> {
  /** Derived request identity. When it changes while watched, the field refetches. */
  key: (state: Record<string, unknown>) => RemoteKey;
  /** Loads data for `key`. Starts on first watch (or reuses cache within `gcTime`). */
  fetch: (key: RemoteKey, ctx: RemoteContext) => T | PromiseLike<T>;
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
