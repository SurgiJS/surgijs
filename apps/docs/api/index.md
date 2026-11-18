# surgijs

## Reactivity

| Export | Signature |
| --- | --- |
| `createSignal` | `(value?) => [get, set]`; `set(v)` or `set(prev => next)` |
| `createMemo` | `(fn, init?) => get`; lazy, cached until a source changes |
| `createRenderEffect` / `effect` | `(fn, init?)`; runs now and on changes, before effects |
| `createEffect` | `(fn, init?)`; runs on the next flush, after render effects |
| `createRoot` | `(fn: (dispose) => T, owner?) => T` |
| `onCleanup` | `(fn)`; runs when the current owner reruns or disposes |
| `onMount` | `(fn)`; runs once after the current render |
| `untrack` | `(fn) => T`; reads without subscribing |
| `batch` | `(fn) => T`; flushes once at the end |
| `flush` | `()`; runs queued memos, render effects and effects |
| `deferMount` | `(fn) => T`; collects effects created inside and starts them after `fn` returns |
| `bind` | `(node, read, apply, arg?)`; compiled binding, `read(arg)` supplies the value |
| `getOwner` / `runWithOwner` | access and restore the current owner |
| `handleError` | `(owner, err)`; forwards to the nearest error boundary or throws |

## Hooks and context

| Export | Signature |
| --- | --- |
| `useState` | same as `createSignal` |
| `useMemo` | same as `createMemo` |
| `useEffect` | `(fn, deps?)` |
| `useRef` | `() => { current: null }` |
| `useId` | `(prefix = 's') => string` |
| `createResource` | `(fetcher) => Resource` with `loading()` and `error()` |
| `createContext` | `(defaultValue) => { Provider, defaultValue }` |
| `useContext` | `(context) => get` |

## Components and control flow

| Export | Props |
| --- | --- |
| `defineComponent` | `(tag, render, schema?, { shadow?, form? })` |
| `For` | `each`, `by?`, `children: (item, index) => JSX` |
| `Show` | `when`, `fallback?`, `children` (node or `(value) => JSX`) |
| `Switch` / `Match` | `fallback?` / `when`, `children` |
| `Portal` | `mount?`, `children` |
| `ErrorBoundary` | `fallback: JSX | (err, reset) => JSX`, `children` |

Types: `ReactiveProps<P>`, `Accessor`, `Setter`, `Signal`, `Resource`, `Ref`, `Schema`, `PropType`, `ComponentOptions`, `ComponentClass`, `FormHost`, `JSX`.

## DOM helpers

The compiler emits these; they are public for hand-written integrations.

| Export | Purpose |
| --- | --- |
| `template(html, flags?)` | cloner for a static template; flag `1` imports the node, `2` parses inside `<svg>` |
| `insert(parent, value, marker?, current?)` | renders a value at a position |
| `setText`, `className`, `attr`, `attrNS`, `style`, `setProp`, `spread`, `use` | single DOM writes |
| `delegate(events)`, `delegateRoot(root)`, `undelegateRoot(root)` | event delegation |
| `createComponent(fn, props)` | calls a component untracked |
| `toNodes(value)` | resolves a value to a node list |
| `diff(parent, a, b)` | keyed reconciliation of two node lists |

## surgijs/server

| Export | Purpose |
| --- | --- |
| `renderToString(tag, view, props?)` | HTML with a declarative shadow root |
| `shadowHTML(tag, inner, attrs?)` | host tag wrapper |
| `escape(value)`, `attrPart(name, value)` | helpers used by SSR output |

## surgijs/hydrate

| Export | Purpose |
| --- | --- |
| `enableHydration()` | components adopt existing shadow root content |
| `disableHydration()` | back to client rendering |
