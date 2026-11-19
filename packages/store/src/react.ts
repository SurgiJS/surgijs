import {
  createContext,
  createElement,
  useContext,
  useLayoutEffect,
  useReducer,
  useRef,
  useCallback,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { deepEqual } from './equal';
import type { StoreState } from './remote';
import { createSnapshot, getPath } from './snapshot';
import type { Equals, Selector, Store } from './store';

const StoreCtx = createContext<Store<Record<string, unknown>> | null>(null);

export interface StoreProviderProps<D extends Record<string, unknown>> {
  store: Store<D>;
  children?: ReactNode;
}

/** Puts `store` on context so `useStore()` can omit the store argument. */
export function StoreProvider<D extends Record<string, unknown>>(props: StoreProviderProps<D>) {
  return createElement(StoreCtx.Provider, { value: props.store as Store<Record<string, unknown>> }, props.children);
}

function useStoreFromContext<D extends Record<string, unknown>>(): Store<D> {
  const store = useContext(StoreCtx);
  if (!store) throw new Error('@surgijs/store: useStore() needs a store argument or <StoreProvider>');
  return store as Store<D>;
}

function useSelector<D extends Record<string, unknown>, T>(
  store: Store<D>,
  selector: Selector<D, T>,
  equals: Equals<T> = deepEqual as Equals<T>,
): T {
  const selectorRef = useRef(selector);
  selectorRef.current = selector;
  const equalsRef = useRef(equals);
  equalsRef.current = equals;
  const cache = useRef<{ ready: boolean; value: T; selector: Selector<D, T> | null }>({
    ready: false,
    value: undefined as T,
    selector: null,
  });

  const subscribe = useCallback(
    (onChange: () => void) =>
      store.subscribe(
        (s) => selectorRef.current(s),
        (value) => {
          cache.current = { ready: true, value, selector: selectorRef.current };
          onChange();
        },
        { equals: (a, b) => equalsRef.current(a, b) },
      ),
    [store],
  );

  const getSnapshot = () => {
    const sel = selectorRef.current;
    // Recompute when the selector identity changes (closed-over inputs).
    if (cache.current.ready && cache.current.selector === sel) return cache.current.value;
    const next = sel(store.get() as StoreState<D>);
    cache.current = { ready: true, value: next, selector: sel };
    return next;
  };

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * Tracking snapshot for destructuring. Re-renders only when an accessed path
 * changes (deep equality). Nested reads are tracked:
 *
 * ```tsx
 * const { userId, user: details } = useStore();
 * console.log(userId, details);
 * ```
 */
function useSnapshot<D extends Record<string, unknown>>(store: Store<D>): StoreState<D> {
  const access = useRef<string[][]>([]);
  const pathsRef = useRef<string[][]>([]);
  const [, rerender] = useReducer((n: number) => n + 1, 0);

  access.current = [];
  const state = store.get();
  const snap = createSnapshot(state, access.current);
  // Resubscribe only when accessed paths change — not on every parent re-render.
  const pathKey = access.current.map((p) => p.join('\0')).join('\n');

  useLayoutEffect(() => {
    pathsRef.current = access.current.slice();
    return store.subscribe(
      (s) => pathsRef.current.map((p) => getPath(s, p)),
      () => rerender(),
      { equals: deepEqual },
    );
  }, [store, pathKey]);

  return snap;
}

export function useStore<D extends Record<string, unknown>>(): StoreState<D>;
export function useStore<D extends Record<string, unknown>>(store: Store<D>): StoreState<D>;
export function useStore<D extends Record<string, unknown>, T>(selector: Selector<D, T>, equals?: Equals<T>): T;
export function useStore<D extends Record<string, unknown>, T>(
  store: Store<D>,
  selector: Selector<D, T>,
  equals?: Equals<T>,
): T;
export function useStore(a?: unknown, b?: unknown, c?: unknown): unknown {
  if (typeof a === 'function') {
    return useSelector(useStoreFromContext(), a as Selector<Record<string, unknown>, unknown>, b as Equals<unknown>);
  }
  if (a && typeof a === 'object' && typeof (a as Store<Record<string, unknown>>).get === 'function') {
    const store = a as Store<Record<string, unknown>>;
    if (typeof b === 'function') return useSelector(store, b as Selector<Record<string, unknown>, unknown>, c as Equals<unknown>);
    return useSnapshot(store);
  }
  return useSnapshot(useStoreFromContext());
}
