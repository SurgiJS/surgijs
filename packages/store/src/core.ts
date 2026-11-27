import { createSignal, getOwner, onCleanup, type Accessor } from '@surgijs/core';
import { deepEqual } from './equal';
import type { RemoteKeys, RemoteMeta, RemoteData } from './remote';
import type { Equals, Selector, Store } from './store';

/**
 * Bind a store selector to a `@surgijs/core` signal. The returned accessor is tracked by
 * effects and bindings, and the subscription (which keeps remotes loaded) ends with the
 * current owner, for example the component that called it.
 *
 * ```tsx
 * const city = fromStore(store, (s) => s.city);
 * return <p>{city()?.name}</p>;
 * ```
 */
export function fromStore<D extends Record<string, unknown>, T>(
  store: Store<D>,
  selector: Selector<D, T>,
  equals: Equals<T> = deepEqual as Equals<T>,
): Accessor<T> {
  const [value, setValue] = createSignal<T>(store.get(selector));
  const stop = store.subscribe(selector, (next) => setValue(() => next), { equals });
  if (getOwner()) onCleanup(stop);
  return value;
}

/** `store.status(key)` as a signal: `isPending`, `isError`, `isPreviousData`, … */
export function fromStatus<D extends Record<string, unknown>, K extends RemoteKeys<D>>(
  store: Store<D>,
  key: K,
): Accessor<RemoteMeta<RemoteData<D, K>>> {
  const read = () => store.status(key);
  const [value, setValue] = createSignal(read());
  const stop = store.subscribe(read, (next) => setValue(() => next), { equals: () => false });
  if (getOwner()) onCleanup(stop);
  return value;
}
