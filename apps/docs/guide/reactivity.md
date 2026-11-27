# Reactivity and hooks

Components use hooks with React names. Code outside components (shared state, stores, utilities) uses the `create*` primitives the hooks are built on. One rule:

> Inside a component, `use*`. Outside a component, `create*`.

The difference from React: a component function runs **once**. State and props are getters, so the DOM updates where a value is read, not by running the component again. See [SurgiJS for React developers](./from-react).

## Hooks

```tsx
import { useEffect, useMemo, useState, type ReactiveProps } from '@surgijs/core';

const Counter = (props: ReactiveProps<{ step?: number }>) => {
  const { step } = props;
  const [count, setCount] = useState(0);
  const double = useMemo(() => count() * 2, [count]);

  useEffect(() => {
    document.title = `Clicked ${count()} times`;
  }, [count]);

  useEffect(() => {
    const id = setInterval(() => setCount((c) => c + 1), 1000);
    return () => clearInterval(id);
  }, []);

  return <button onClick={() => setCount((c) => c + (step() ?? 1))}>{count} × 2 = {double}</button>;
};
```

| Hook | Behavior |
| --- | --- |
| `useState(init)` | `[get, set]`; `set(v)` or `set(prev => next)` |
| `useMemo(fn, deps?)` | cached getter; recomputes when a signal it reads changes, or only when a listed dependency does |
| `useEffect(fn, deps?)` | runs after mount and when dependencies change; the returned function runs as cleanup before the next run and on unmount |
| `useRef()` | `{ current: null }` for `ref={...}` |
| `useId(prefix?)` | unique id such as `s-1` |
| `useContext(context)` | getter for the nearest provider's value |
| `createResource(fetcher)` | accessor with `loading()` and `error()`; tracks signals read by the fetcher and drops stale responses |

### Dependencies

`deps` works as in React:

- no `deps`: every signal read inside the hook is tracked, so the dependency list writes itself;
- `[a, b]`: only `a` and `b` are tracked, and the hook body runs untracked;
- `[]`: the effect runs once after mount, the memo computes once.

In `.tsx` and `.jsx` files the compiler rewrites `[a, b]` into `() => [a(), b()]`, so the listed getters are read inside the effect. In plain `.ts` (custom hooks outside the compiler) pass that function, or an array of getters: `useEffect(fn, [count])` calls each function in the array.

### Reading values

JSX and template literals in components read getters for you: `{count}` and `` `${title}` `` update when the signal changes. In other code call the getter, `count() * 2`, as TypeScript sees a getter there.

## Signals outside components

```ts
import { createSignal, createMemo, createEffect, batch } from '@surgijs/core';

const [count, setCount] = createSignal(0);
const double = createMemo(() => count() * 2);
createEffect(() => console.log(double()));

setCount(1);
setCount((c) => c + 1);
batch(() => {
  setCount(10);
  setCount(11);
});
```

- A signal is `{ v, o }`: the value and its observers.
- Setters compare with `Object.is` and schedule a flush on a microtask. `batch` and the microtask both coalesce writes.
- `flush()` runs queued work immediately: memos first, then render effects, then effects.
- Memos are lazy: a read of a stale memo recomputes it.
- Dependencies are positional. A computation that reads the same signals in the same order on each run keeps its subscription list untouched.

## Ownership

Every computation and root has an owner `{ c, p, k, e }`: cleanups and children, parent, context, error handler. Disposing an owner runs its cleanups in reverse order and disposes its children.

```ts
const dispose = createRoot((dispose) => {
  createEffect(() => console.log(count()));
  onCleanup(() => console.log('bye'));
  return dispose;
});
```

`untrack(fn)` reads without subscribing. `getOwner()` and `runWithOwner(owner, fn)` carry ownership into callbacks.

## Bindings

`bind(node, read, apply, arg?)` from `@surgijs/core/internal` is the compact form the compiler emits. It runs `read(arg)` once while collecting sources, applies the value, and subscribes a small bound node only when the read touched signals. Updates call `apply(node, value)` when the value changes. A signal with one observer stores it directly, and an owner keeps its bindings in a linked list, so a bound row allocates no arrays.

## Context

```tsx
const Theme = createContext('light');

const Label = () => {
  const theme = useContext(Theme);
  return <span class={theme}>label</span>;
};

<Theme.Provider value={mode}>
  <Label />
</Theme.Provider>;
```

`useContext` returns a getter, so a provider value that changes updates the readers.
