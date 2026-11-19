import type { StoreState, SyncKeys } from './remote';
import type { Selector, Store } from './store';

export type Get<D extends Record<string, unknown>> = {
  (): StoreState<D>;
  <T>(selector: Selector<D, T>): T;
  <K extends keyof StoreState<D>>(key: K): StoreState<D>[K];
};

export type SetStore<D extends Record<string, unknown>> = {
  <K extends SyncKeys<D>>(key: K, value: D[K]): void;
  (partial: Partial<{ [K in SyncKeys<D>]: D[K] }>): void;
};

export type ActionFn<D extends Record<string, unknown>, A extends unknown[]> = (
  get: Get<D>,
  set: SetStore<D>,
  ...args: A
) => void;

export type Action<A extends unknown[]> = {
  <D extends Record<string, unknown>>(store: Store<D>, ...args: A): void;
  bind<D extends Record<string, unknown>>(store: Store<D>): (...args: A) => void;
};

/**
 * Write helper in the spirit of jotai write atoms, for one shared store:
 *
 * ```ts
 * const multiplyCount = action((get, set, by: number) => {
 *   set('count', get('count') * by);
 * });
 * multiplyCount(store, 2);
 * ```
 */
export function action<A extends unknown[]>(
  fn: (get: Get<Record<string, any>>, set: SetStore<Record<string, any>>, ...args: A) => void,
): Action<A> {
  const run = (<D extends Record<string, unknown>>(store: Store<D>, ...args: A) => {
    const get = ((keyOrSelector?: unknown) => {
      if (keyOrSelector === undefined) return store.get();
      if (typeof keyOrSelector === 'function') return store.get(keyOrSelector as Selector<D, unknown>);
      return store.get((s) => s[keyOrSelector as keyof StoreState<D>]);
    }) as Get<D>;
    fn(get as Get<Record<string, any>>, store.set as SetStore<Record<string, any>>, ...args);
  }) as Action<A>;

  run.bind = <D extends Record<string, unknown>>(store: Store<D>) => (...args: A) => run(store, ...args);
  return run;
}
