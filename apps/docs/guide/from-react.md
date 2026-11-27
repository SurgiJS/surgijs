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

## Primitives

Hooks are thin wrappers over `createSignal`, `createMemo` and `createEffect`. Use those outside components: shared state in a module, stores, utilities. Inside components prefer the hooks; [Reactivity](./reactivity) has the details.
