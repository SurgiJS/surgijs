import { createEffect, createMemo, createRenderEffect, createSignal, onCleanup, untrack, type Accessor, type Signal } from './reactivity';

let devHook: ((kind: string, read: () => unknown) => void) | null = null;

export function setDevHook(fn: typeof devHook): void {
  devHook = fn;
}

/** `[get, set]` pair. The compiler reads `get` as a value inside JSX and component bodies. */
export function useState<T>(): Signal<T | undefined>;
export function useState<T>(value: T): Signal<T>;
export function useState<T>(value?: T): Signal<T | undefined> {
  const signal = createSignal(value);
  if (devHook) devHook('useState', signal[0]);
  return signal;
}

/**
 * Dependencies of `useEffect` and `useMemo`. In compiled `.tsx`/`.jsx` files write them as in
 * React, `[count, step]`: the compiler turns the array into `() => [count(), step()]`, so the
 * listed signals are tracked. Elsewhere pass that function, or an array of getters.
 */
export type Deps = (() => unknown) | readonly unknown[];

/**
 * Runs `fn` for a computation. Without `deps` it tracks what `fn` reads; with `deps` it
 * tracks only the listed signals and runs `fn` untracked.
 */
function withDeps<T>(deps: Deps | undefined, fn: () => T): T {
  if (!deps) return fn();
  if (typeof deps === 'function') deps();
  else for (const d of deps) if (typeof d === 'function') d();
  return untrack(fn);
}

/**
 * Runs after mount and again when a dependency changes. Without `deps` every signal read in
 * `fn` is tracked; with `deps` only the listed signals are, and `[]` runs once. A returned
 * function runs as cleanup before the next run and on unmount.
 */
export function useEffect(fn: () => void | (() => void), deps?: Deps): void {
  createEffect(() => {
    const dispose = withDeps(deps, fn);
    if (typeof dispose === 'function') onCleanup(dispose);
  });
}

export interface Ref<T> {
  current: T | null;
}

export function useRef<T = Element>(): Ref<T> {
  const ref: Ref<T> = { current: null };
  if (devHook) devHook('useRef', () => ref);
  return ref;
}

/**
 * Cached value, returned as a getter. Without `deps` it recomputes when a signal read in `fn`
 * changes; with `deps` only when a listed signal does. For an initial `prev` value use
 * `createMemo(fn, init)`.
 */
export function useMemo<T>(fn: (prev: T | undefined) => T, deps?: Deps): Accessor<T> {
  const get = createMemo<T>((prev) => withDeps(deps, () => fn(prev)));
  if (devHook) devHook('useMemo', get);
  return get;
}

let ids = 0;

/** Unique id within the document, stable for the component instance. */
export function useId(prefix = 's'): string {
  const id = `${prefix}-${(++ids).toString(36)}`;
  if (devHook) devHook('useId', () => id);
  return id;
}

export interface Resource<T> {
  (): T | undefined;
  loading: Accessor<boolean>;
  error: Accessor<unknown>;
}

/**
 * Calls `fetcher` now and whenever a signal it reads changes. Only the latest run
 * updates the resource; earlier promises settle silently.
 */
export function createResource<T>(fetcher: () => T | PromiseLike<T>): Resource<T> {
  const [value, setValue] = createSignal<T>();
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<unknown>();
  let seq = 0;
  createRenderEffect(() => {
    const id = ++seq;
    let result: T | PromiseLike<T>;
    try {
      result = fetcher();
    } catch (err) {
      setError(() => err);
      setLoading(false);
      return;
    }
    if (result && typeof (result as PromiseLike<T>).then === 'function') {
      setLoading(true);
      (result as PromiseLike<T>).then(
        (v) => {
          if (id !== seq) return;
          setValue(() => v);
          setError(undefined);
          setLoading(false);
        },
        (err) => {
          if (id !== seq) return;
          setError(() => err);
          setLoading(false);
        },
      );
    } else {
      setValue(() => result as T);
      setError(undefined);
      setLoading(false);
    }
  });
  const resource = (() => value()) as Resource<T>;
  resource.loading = loading;
  resource.error = error;
  return resource;
}
