# SurgiJS for React developers

SurgiJS keeps the parts of React you write every day (JSX, components as functions, hooks with the same names) and compiles them to web components with fine-grained updates. Most code reads the same. The differences come from one fact:

> **A component runs once.** It sets up state and returns the DOM; after that, a change updates only the places that read it.

## Side by side

| React | SurgiJS |
| --- | --- |
| `function Counter({ step })` | `const Counter = (props: ReactiveProps<{ step?: number }>)`, then `const { step } = props` |
| `step` is a value | `step` is a getter: `{step}` in JSX, `step()` in code |
| `const [count, setCount] = useState(0)` | same; `count` is a getter |
| `count * 2` | `count() * 2` (JSX and template literals call it for you) |
| `useMemo(() => count * 2, [count])` | `useMemo(() => count() * 2, [count])` |
| `useEffect(fn, [count])` | same |
| `useEffect(fn, [])` | same: runs once after mount |
| `useEffect(fn)` (every render) | `useEffect(fn)` tracks every signal `fn` reads and reruns when one changes |
| `useCallback(fn, deps)` | a plain function: components do not re-run, so functions are stable |
| `React.memo`, `key` tricks to avoid renders | not needed |
| `useRef()` | same, `ref={ref}` on an element |
| `useContext(Ctx)` | same, returns a getter |
| `{items.map((i) => <Row key={i.id} … />)}` | `<For each={items} by={(i) => i.id}>{(i) => <Row … />}</For>` |
| `{cond && <A />}` | `<Show when={cond}><A /></Show>` |
| `className` | `class` (or `className`) |
| `onChange` on inputs | `onInput` for every keystroke, `onChange` on commit, as in the DOM |
| `export default App` + `createRoot(el).render(<App />)` | `defineComponent('my-app', App, schema)` and `<my-app>` in HTML |

## Things that behave differently

**The component body is not a render function.** Code at the top of a component runs once, at mount. Reading a getter there takes a snapshot:

```tsx
const Price = (props: ReactiveProps<{ amount: number }>) => {
  const { amount } = props;
  const label = `$${amount().toFixed(2)}`; // computed once, never updates
  const live = () => `$${amount().toFixed(2)}`; // a function updates where it is read
  return <span>{live}</span>;
};
```

Use `useMemo` or a plain arrow for derived values, as in `live` above.

**Do not destructure into values.** `const { amount } = props` keeps the getter. `const amount = props.amount()` reads it once. The same holds for objects: `{ count }` in an object literal stores the current value, and the compiler warns about it.

**Hooks have no rules of hooks.** Since components run once, hooks can be called in conditions, loops and `For` rows. The order does not matter.

**Effects run after mount and on change.** There is no render phase to sync with, so `useEffect` covers what `useLayoutEffect` does in React; DOM refs are attached when it runs.

**Props are attributes too.** Each component is a custom element. Props declared in the schema map to attributes (`maxItems` ↔ `max-items`) and properties, so the element works from plain HTML and other frameworks.

**Events.** Inside a component, `onClick` and friends work as in React (delegated, `stopPropagation()` honored). To emit events from a component, declare them with `defineEvent`; see [Components](./components#events).

## React hooks you will not need

They exist to cope with re-renders, concurrent rendering or React-specific plumbing. A component that runs once has none of those problems.

| React | Why | In SurgiJS |
| --- | --- | --- |
| `useCallback` | keeps a function's identity across renders | a plain function; it is created once |
| `useLayoutEffect` | runs after the DOM changes, before paint | `useEffect`: it runs when the element connects, with the DOM attached and before paint |
| `useReducer` | state changes through `(state, action) => state` | `useState` and a function that calls the setter |
| `useImperativeHandle` | what a parent gets through `ref` | methods and properties live on the custom element itself |
| `useSyncExternalStore` | subscribe to an external source | a signal set from a listener in `useEffect`, or `fromStore` from `@surgijs/store/core` |
| `useInsertionEffect` | CSS-in-JS before layout | `defineComponent(..., { styles })`, shared through `adoptedStyleSheets` |
| `useTransition`, `useDeferredValue` | keep input responsive during heavy renders | updates are fine-grained and batched in a microtask; there is no render to defer |
| `useEffectEvent` | read fresh values in an effect without depending on them | list only what should trigger the effect in `deps`, or read with `untrack(fn)` |
| `use` + Suspense | read a promise during render | `createResource` with `Show` for loading and error states |
| `useActionState`, `useFormStatus`, `useOptimistic` | forms and server actions | form-associated elements (`{ form: true }`); `mutation` in `@surgijs/store` for optimistic updates |
| `useDebugValue` | label a custom hook in React DevTools | hook values show up in React DevTools without it |

## Coming from Vue, Svelte or Angular

Vue's Composition API, Svelte 5 runes and Angular signals also run component setup once and track dependencies, so most of their concepts map one to one.

| Task | React | SurgiJS | Vue 3 | Svelte 5 | Angular |
| --- | --- | --- | --- | --- | --- |
| State | `useState` | `useState` | `ref()` | `$state` | `signal()` |
| Derived value | `useMemo` | `useMemo` | `computed()` | `$derived` | `computed()` |
| Effect, tracked automatically | — | `useEffect(fn)` | `watchEffect()` | `$effect` | `effect()` |
| Effect on listed dependencies | `useEffect(fn, deps)` | `useEffect(fn, deps)` | `watch(deps, fn)` | `$effect` + `untrack` | `effect()` + `untracked()` |
| After mount | `useEffect(fn, [])` | `useEffect(fn, [])` | `onMounted` | `onMount` | `afterNextRender()` |
| Cleanup | function returned from `useEffect` | function returned from `useEffect` | `onUnmounted`, `onWatcherCleanup` | function returned from `$effect` | `DestroyRef.onDestroy()` |
| DOM reference | `useRef` | `useRef` | `useTemplateRef()` | `bind:this` | `viewChild()` |
| Context | `createContext` + `useContext` | same | `provide` / `inject` | `setContext` / `getContext` | providers + `inject()` |
| Async data | `use` + Suspense | `createResource` | async `setup` + `Suspense` | `{#await}` | `resource()` |
| Read without tracking | — | `untrack` | — | `untrack` | `untracked()` |
| List | `items.map` + `key` | `<For each by>` | `v-for` + `:key` | `{#each items as i (i.id)}` | `@for (i of items; track i.id)` |
| Condition | `cond && <A />` | `<Show when>` | `v-if` | `{#if}` | `@if` |
| Ship as a web component | wrapper library | every component is one | `defineCustomElement` | `customElement: true` | `@angular/elements` |

## Primitives

Hooks are thin wrappers over `createSignal`, `createMemo` and `createEffect`. Use those outside components: shared state in a module, stores, utilities. Inside components prefer the hooks; [Reactivity](./reactivity) has the details.
