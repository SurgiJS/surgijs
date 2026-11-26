import { toNodes } from './dom';
import {
  createMemo,
  createRenderEffect,
  createRoot,
  createSignal,
  getOwner,
  handleError,
  onCleanup,
  untrack,
  type Accessor,
} from './reactivity';
import type { JSX } from './jsx-runtime';

type MaybeAccessor<T> = T | Accessor<T>;
type Branch<T> = JSX.Element | ((value: T) => JSX.Element);

const read = <T>(v: MaybeAccessor<T>): T => (typeof v === 'function' ? (v as Accessor<T>)() : v);
const truthy = (v: unknown): boolean => v != null && v !== false;
const resolve = (c: unknown, value?: unknown): JSX.Element =>
  (typeof c === 'function' ? (c as (v: unknown) => JSX.Element)(value) : c) as JSX.Element;

/**
 * Mounts `render(i, value(i))` for the selected index; the previous branch disposes.
 * A change of either the index or the value mounts the branch again.
 */
function branch(select: () => number, value: (i: number) => unknown, render: (i: number, v: unknown) => JSX.Element): JSX.Element {
  let dispose: (() => void) | undefined;
  let index: number | undefined;
  let current: unknown;
  onCleanup(() => dispose && dispose());
  return createMemo((prev) => {
    const i = select();
    const v = value(i);
    if (i === index && Object.is(v, current)) return prev;
    index = i;
    current = v;
    if (dispose) dispose();
    return createRoot((d) => {
      dispose = d;
      return untrack(() => render(i, v));
    });
  }) as unknown as JSX.Element;
}

/** The `when` value for a child function that declares a parameter (it re-mounts on change); `undefined` otherwise. */
const keyed = (on: boolean, c: { when: MaybeAccessor<unknown>; children: unknown }): unknown =>
  on && typeof c.children === 'function' && c.children.length ? read(c.when) : undefined;

export interface ShowProps<T> {
  when: MaybeAccessor<T | null | undefined | false>;
  fallback?: JSX.Element | (() => JSX.Element);
  children: Branch<T>;
}

/**
 * `when ? children : fallback`. `0` and `''` count as true; `null`, `undefined`, `false` as false.
 * A function child receives the value and renders again when it changes.
 */
export function Show<T>(props: ShowProps<T>): JSX.Element {
  return branch(
    () => (truthy(read(props.when)) ? 1 : 0),
    (i) => keyed(i > 0, props),
    (i, v) => (i ? resolve(props.children, v) : resolve(props.fallback)),
  );
}

export interface MatchProps<T> {
  when: MaybeAccessor<T | null | undefined | false>;
  children: Branch<T>;
}

const MATCH = Symbol('match');

/** A `Switch` case. Mounts nothing by itself. */
export function Match<T>(props: MatchProps<T>): JSX.Element {
  return { [MATCH]: true, when: props.when, children: props.children } as unknown as JSX.Element;
}

export interface SwitchProps {
  fallback?: JSX.Element | (() => JSX.Element);
  children: JSX.Element | (() => JSX.Element);
}

/** Mounts the first `Match` whose `when` is true, otherwise `fallback`. */
export function Switch(props: SwitchProps): JSX.Element {
  const cases: MatchProps<unknown>[] = [];
  const collect = (v: unknown): void => {
    if (Array.isArray(v)) v.forEach(collect);
    else if (v && (v as Record<symbol, unknown>)[MATCH]) cases.push(v as MatchProps<unknown>);
  };
  collect(untrack(() => resolve(props.children)));
  return branch(
    () => {
      for (let i = 0; i < cases.length; i++) if (truthy(read(cases[i]!.when))) return i;
      return -1;
    },
    (i) => keyed(i >= 0, cases[i]!),
    (i, v) => (i < 0 ? resolve(props.fallback) : resolve(cases[i]!.children, v)),
  );
}

export interface PortalProps {
  mount?: MaybeAccessor<Node | null | undefined>;
  children?: JSX.Element;
}

/** Renders `children` into `mount` (default `document.body`) and leaves a comment in place. */
export function Portal(props: PortalProps): JSX.Element {
  const marker = document.createComment('');
  const nodes = toNodes(props.children);
  createRenderEffect(() => {
    const target = read(props.mount) || document.body;
    for (let i = 0; i < nodes.length; i++) target.appendChild(nodes[i]!);
  });
  onCleanup(() => {
    for (let i = 0; i < nodes.length; i++) {
      nodes[i]!.parentNode?.removeChild(nodes[i]!);
    }
  });
  return marker;
}

export interface ErrorBoundaryProps {
  fallback: JSX.Element | ((err: unknown, reset: () => void) => JSX.Element);
  children: JSX.Element | (() => JSX.Element);
}

/**
 * Catches errors thrown by computations created inside `children` and renders
 * `fallback(err, reset)`. `reset` mounts the children again.
 */
export function ErrorBoundary(props: ErrorBoundaryProps): JSX.Element {
  const owner = getOwner();
  const [view, setView] = createSignal<unknown>();
  let dispose: (() => void) | undefined;
  let pending = false;

  const mount = (fn: () => unknown, trap: boolean): unknown => {
    if (dispose) dispose();
    return createRoot((d) => {
      dispose = d;
      const scope = getOwner()!;
      if (trap)
        scope.e = (err) => {
          if (pending) return;
          pending = true;
          queueMicrotask(() => {
            pending = false;
            fail(err);
          });
        };
      let v: unknown;
      try {
        v = untrack(fn);
      } catch (err) {
        handleError(trap ? scope : owner, err);
        return undefined;
      }
      return typeof v === 'function' ? createMemo(v as () => unknown) : v;
    }, owner);
  };

  const fail = (err: unknown): void => {
    setView(() =>
      mount(() => {
        const f = props.fallback;
        return typeof f === 'function' ? f(err, reset) : f;
      }, false),
    );
  };

  const reset = (): void => {
    setView(() => mount(() => resolve(props.children), true));
  };

  onCleanup(() => dispose && dispose());
  reset();
  return (() => {
    const v = view();
    return typeof v === 'function' ? v() : v;
  }) as unknown as JSX.Element;
}
