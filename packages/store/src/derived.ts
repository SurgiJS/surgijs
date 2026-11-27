import { deepEqual } from './equal';
import type { StoreState } from './remote';
import type { Equals, Selector, Store } from './store';

export type DerivedGet<D extends Record<string, unknown>> = {
  (): StoreState<D>;
  <U>(selector: Selector<D, U>): U;
  <K extends keyof StoreState<D>>(key: K): StoreState<D>[K];
};

export type DerivedFn<D extends Record<string, unknown>, T> = (get: DerivedGet<D>) => T;

export type Derived<T> = {
  <D extends Record<string, unknown>>(store: Store<D>): T;
  bind<D extends Record<string, unknown>>(store: Store<D>): () => T;
};

/**
 * Cached selector. Recomputes only when the store snapshot changes; keeps the
 * previous reference when the new value is equal (default: deep equality).
 *
 * ```ts
 * const double = derived((get) => get('count') * 2);
 * double(store);
 * ```
 */
export function derived<T>(
  fn: (get: DerivedGet<Record<string, any>>) => T,
  equals: Equals<T> = deepEqual as Equals<T>,
): Derived<T> {
  const byStore = new WeakMap<object, { state: object; value: T }>();

  const run = (<D extends Record<string, unknown>>(store: Store<D>) => {
    const state = store.get() as object;
    const hit = byStore.get(store as object);
    if (hit && hit.state === state) return hit.value;

    const get = ((keyOrSelector?: unknown) => {
      if (keyOrSelector === undefined) return store.get();
      if (typeof keyOrSelector === 'function') return store.get(keyOrSelector as Selector<D, unknown>);
      return store.get((s) => s[keyOrSelector as keyof StoreState<D>]);
    }) as DerivedGet<Record<string, any>>;

    const next = fn(get);
    if (hit && equals(hit.value, next)) {
      hit.state = state;
      return hit.value;
    }
    byStore.set(store as object, { state, value: next });
    return next;
  }) as Derived<T>;

  run.bind = <D extends Record<string, unknown>>(store: Store<D>) => () => run(store);
  return run;
}
