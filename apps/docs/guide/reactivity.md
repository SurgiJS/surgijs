# Reactivity and hooks

## Signals

```ts
import { createSignal, createMemo, createEffect, batch } from 'surgijs';

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

`bind(node, read, apply, arg?)` is the compact form the compiler emits. It runs `read(arg)` once while collecting sources, applies the value, and subscribes a small bound node only when the read touched signals. Updates call `apply(node, value)` when the value changes. A signal with one observer stores it directly, and an owner keeps its bindings in a linked list, so a bound row allocates no arrays.

## Hooks

| Hook | Behavior |
| --- | --- |
| `useState(init)` | `createSignal` |
| `useMemo(fn)` | `createMemo` |
| `useEffect(fn, deps?)` | effect after mount; the returned function runs as cleanup. With a `deps` function, only the signals it reads trigger `fn` |
| `useRef()` | `{ current: null }` for `ref={...}` |
| `useId(prefix?)` | unique id such as `s-1` |
| `createResource(fetcher)` | accessor with `loading()` and `error()`; tracks signals read by the fetcher and drops stale responses |

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
