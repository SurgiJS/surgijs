import { DestroyRef, inject, signal, type Signal } from '@angular/core';
import { deepEqual } from './equal';
import type { RemoteData, RemoteKeys, RemoteMeta } from './remote';
import type { Equals, Selector, Store } from './store';

export interface StoreSignalOptions<T> {
  /** Defaults to structural `deepEqual`. Equal values keep the signal's current value. */
  equals?: Equals<T>;
  /**
   * Ends the subscription when it is destroyed. Defaults to `inject(DestroyRef)`, so the call
   * must run in an injection context (a component, directive, service or `runInInjectionContext`)
   * unless this is passed.
   */
  destroyRef?: DestroyRef;
}

/**
 * Bind a store selector to an Angular signal. The signal is read-only and updates when the
 * selected value changes. The subscription, which keeps remotes loaded, ends with the
 * injection context's `DestroyRef`.
 *
 * ```ts
 * @Component({ template: `{{ city()?.name }}` })
 * class Weather {
 *   city = fromStore(store, (s) => s.city);
 * }
 * ```
 */
export function fromStore<D extends Record<string, unknown>, T>(
  store: Store<D>,
  selector: Selector<D, T>,
  options: StoreSignalOptions<T> = {},
): Signal<T> {
  const destroyRef = options.destroyRef ?? inject(DestroyRef);
  const equals = (options.equals ?? deepEqual) as Equals<T>;
  const value = signal<T>(store.get(selector));
  destroyRef.onDestroy(store.subscribe(selector, (next) => value.set(next), { equals }));
  return value.asReadonly();
}

/** `store.status(key)` as an Angular signal: `isPending`, `isError`, `isPreviousData`, … */
export function fromStatus<D extends Record<string, unknown>, K extends RemoteKeys<D>>(
  store: Store<D>,
  key: K,
  options: Pick<StoreSignalOptions<RemoteMeta<RemoteData<D, K>>>, 'destroyRef'> = {},
): Signal<RemoteMeta<RemoteData<D, K>>> {
  const destroyRef = options.destroyRef ?? inject(DestroyRef);
  const read = () => store.status(key);
  const value = signal(read());
  destroyRef.onDestroy(store.subscribe(read, (next) => value.set(next), { equals: () => false }));
  return value.asReadonly();
}
