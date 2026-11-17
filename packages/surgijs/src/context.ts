import { createRoot, getOwner, onCleanup, untrack, type Accessor } from './reactivity';
import type { JSX } from './jsx-runtime';

export interface ProviderProps<T> {
  value: T | Accessor<T>;
  children?: JSX.Element | (() => JSX.Element);
}

export interface Context<T> {
  id: symbol;
  defaultValue: T;
  Provider: (props: ProviderProps<T>) => JSX.Element;
}

/**
 * Creates a context. `Provider` makes its value visible to every owner created inside it;
 * children that read the value are passed as a function, `{() => <Child />}`.
 */
export function createContext<T>(defaultValue: T): Context<T> {
  const id = Symbol('context');
  const Provider = (props: ProviderProps<T>): JSX.Element => {
    const v = props.value;
    const get = typeof v === 'function' ? (v as Accessor<T>) : () => v;
    let dispose!: () => void;
    const out = createRoot((d) => {
      dispose = d;
      const owner = getOwner()!;
      owner.k = Object.assign(Object.create(owner.k), { [id]: get });
      const c = props.children;
      return untrack(() => (typeof c === 'function' ? (c as () => JSX.Element)() : c));
    });
    onCleanup(dispose);
    return out;
  };
  return { id, defaultValue, Provider };
}

/** Returns a getter for the nearest provided value, or the default. */
export function useContext<T>(ctx: Context<T>): Accessor<T> {
  const k = getOwner()?.k;
  const get = k ? (k[ctx.id] as Accessor<T> | undefined) : undefined;
  return get || (() => ctx.defaultValue);
}
