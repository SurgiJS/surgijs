import { deepEqual } from './equal';
import type { RemoteData, RemoteKeys, RemoteMeta } from './remote';
import type { Equals, Selector, Store } from './store';

/**
 * The Svelte store contract: `subscribe(run)` calls `run` with the current value and
 * returns an unsubscribe function. Structurally compatible with `svelte/store`'s `Readable`,
 * so `$value` in components and `derived()` work without importing `svelte`.
 */
export interface StoreReadable<T> {
  subscribe(run: (value: T) => void, invalidate?: () => void): () => void;
}

/**
 * Bind a store selector to a Svelte store. Each subscriber (`$value` in a component, or a
 * direct `subscribe` call) opens its own store subscription, which ends when it unsubscribes.
 *
 * ```svelte
 * <script>
 *   const city = fromStore(store, (s) => s.city);
 * </script>
 * <p>{$city?.name}</p>
 * ```
 */
export function fromStore<D extends Record<string, unknown>, T>(
  store: Store<D>,
  selector: Selector<D, T>,
  equals: Equals<T> = deepEqual as Equals<T>,
): StoreReadable<T> {
  return {
    subscribe(run) {
      return subscribeWithValue(store, selector, equals, run);
    },
  };
}

/** `store.status(key)` as a Svelte store: `isPending`, `isError`, `isPreviousData`, … */
export function fromStatus<D extends Record<string, unknown>, K extends RemoteKeys<D>>(
  store: Store<D>,
  key: K,
): StoreReadable<RemoteMeta<RemoteData<D, K>>> {
  const read = () => store.status(key);
  return {
    subscribe(run) {
      return subscribeWithValue(store, read, () => false, run);
    },
  };
}

/**
 * Registers before the first call to `run`, so a throwing subscriber cannot leave the store
 * subscription behind without an unsubscribe function.
 */
function subscribeWithValue<D extends Record<string, unknown>, T>(
  store: Store<D>,
  selector: Selector<D, T>,
  equals: Equals<T>,
  run: (value: T) => void,
): () => void {
  const stop = store.subscribe(selector, (value) => run(value), { equals });
  try {
    run(store.get(selector));
  } catch (error) {
    stop();
    throw error;
  }
  return stop;
}
