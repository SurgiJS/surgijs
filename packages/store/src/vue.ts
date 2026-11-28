import { getCurrentScope, onScopeDispose, shallowRef, type ShallowRef } from 'vue';
import { deepEqual } from './equal';
import type { RemoteData, RemoteKeys, RemoteMeta } from './remote';
import type { Equals, Selector, Store } from './store';

/**
 * Bind a store selector to a Vue ref. The ref updates when the selected value changes
 * (deep equality). Inside an effect scope (a component's setup, `effectScope()`) the
 * subscription ends with that scope, which also lets its remotes unload.
 *
 * ```ts
 * const city = fromStore(store, (s) => s.city);
 * // template: {{ city?.name }}
 * ```
 */
export function fromStore<D extends Record<string, unknown>, T>(
  store: Store<D>,
  selector: Selector<D, T>,
  equals: Equals<T> = deepEqual as Equals<T>,
): Readonly<ShallowRef<T>> {
  const value = shallowRef<T>(store.get(selector));
  const stop = store.subscribe(
    selector,
    (next) => {
      value.value = next;
    },
    { equals },
  );
  if (getCurrentScope()) onScopeDispose(stop);
  return value;
}

/** `store.status(key)` as a Vue ref: `isPending`, `isError`, `isPreviousData`, … */
export function fromStatus<D extends Record<string, unknown>, K extends RemoteKeys<D>>(
  store: Store<D>,
  key: K,
): Readonly<ShallowRef<RemoteMeta<RemoteData<D, K>>>> {
  const read = () => store.status(key);
  const value = shallowRef(read());
  const stop = store.subscribe(
    read,
    (next) => {
      value.value = next;
    },
    { equals: () => false },
  );
  if (getCurrentScope()) onScopeDispose(stop);
  return value;
}
