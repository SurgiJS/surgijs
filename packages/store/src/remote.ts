export const REMOTE = Symbol.for('surgijs.store.remote');

export type RemoteKey = string | number | boolean | null | undefined | bigint | symbol | object;

export interface RemoteContext {
  signal: AbortSignal;
}

export interface RemoteOptions<T> {
  /** Derived request identity. When it changes while watched, the field refetches. */
  key: (state: Record<string, unknown>) => RemoteKey;
  /** Loads data for `key`. Only runs while at least one subscriber reads this field. */
  fetch: (key: RemoteKey, ctx: RemoteContext) => T | PromiseLike<T>;
}

export interface RemoteDef<T> {
  readonly [REMOTE]: true;
  readonly key: RemoteOptions<T>['key'];
  readonly fetch: RemoteOptions<T>['fetch'];
}

export function remote<T>(options: RemoteOptions<T>): RemoteDef<T> {
  return { [REMOTE]: true, key: options.key, fetch: options.fetch };
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
