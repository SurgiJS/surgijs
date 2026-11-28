# @surgijs/core

## 0.8.0

### Minor Changes

- [#45](https://github.com/SurgiJS/surgijs/pull/45) [`6664578`](https://github.com/SurgiJS/surgijs/commit/6664578cb4cc1411408ae93ef7557e97a72da01a) Thanks [@banzalik](https://github.com/banzalik)! - `@surgijs/astro` is an Astro integration that renders `defineComponent` components to declarative shadow DOM and hydrates them in islands. To support it, the Vite plugin takes `generate: 'auto'` (server output in Vite's SSR graph, DOM output elsewhere), and `defineComponent` without a DOM returns a class that carries its tag, render function, schema and options.

- [#42](https://github.com/SurgiJS/surgijs/pull/42) [`e312701`](https://github.com/SurgiJS/surgijs/commit/e312701a04a6e3569883c32d8457fe25c28e4a28) Thanks [@banzalik](https://github.com/banzalik)! - Development builds print `console.warn` messages for five silent mistakes: a tag already defined by another copy of the library, a signal written inside `createMemo` or a binding, `For` over objects without `by`, a prop read in the component body outside a reactive context, and an effect that keeps rescheduling itself. The checks ship in a separate development build that the `development` export condition selects (Vite and webpack set it in development). The default build has no checks and no reference to `process`, so it still runs unbundled from a CDN, an import map, Node or Deno.

- [#38](https://github.com/SurgiJS/surgijs/pull/38) [`84325cb`](https://github.com/SurgiJS/surgijs/commit/84325cb77e8ee8a1c35b37b25a359f29de2db1b3) Thanks [@banzalik](https://github.com/banzalik)! - `useReducer(reducer, init)` returns `[state, dispatch]`: each `dispatch(action)` stores `reducer(state, action)`. The compiler reads `state` as a value inside JSX, like `useState`. The hook is built on `useState`, so an app that does not call it leaves it out of the bundle.

### Patch Changes

- [#36](https://github.com/SurgiJS/surgijs/pull/36) [`1d196b6`](https://github.com/SurgiJS/surgijs/commit/1d196b6eb87a8f2f76c8dc76fff7b2c16e8dc042) Thanks [@banzalik](https://github.com/banzalik)! - Template markup is now parsed through a `surgijs` Trusted Types policy, so SurgiJS works under `require-trusted-types-for 'script'`. Add `surgijs` to the CSP `trusted-types` directive. Without Trusted Types, or if the policy is refused, nothing changes.

## 0.7.0

### Minor Changes

- [#32](https://github.com/SurgiJS/surgijs/pull/32) [`1a19349`](https://github.com/SurgiJS/surgijs/commit/1a193495a304818652511e229c107c2ab72b0ad9) Thanks [@banzalik](https://github.com/banzalik)! - Hooks take React-style dependency lists. `useEffect(fn, [a, b])` reruns only when `a` or `b` changes and `[]` runs it once after mount; `useMemo(fn, [a])` recomputes only when `a` changes. In `.tsx`/`.jsx` files the compiler turns the array into `() => [a(), b()]` so the getters are tracked; outside compiled files pass that function or an array of getters (new `Deps` type).

  **Breaking:**

  - The second argument of `useMemo` is the dependency list instead of the initial value; use `createMemo(fn, init)` for an initial value.
  - Helpers that compiled JSX calls (`template`, `insert`, `bind`, `effect`, `attr`, `className`, `delegate`, `spread`, …) moved from `@surgijs/core` to `@surgijs/core/internal`, and the compiler imports them from there. `@surgijs/core` keeps only the application API. Update `@surgijs/compiler` and `@surgijs/core` together.

## 0.6.0

### Minor Changes

- [#22](https://github.com/SurgiJS/surgijs/pull/22) [`2ea1a7d`](https://github.com/SurgiJS/surgijs/commit/2ea1a7db0049c1a36eaee711a927d7978dadd31c) Thanks [@banzalik](https://github.com/banzalik)! - `defineEvent<T>(flags?)` declares an event and its `detail` type, and `defineComponent<P, X>(tag, render, schema, { events })` takes those declarations. The render function receives a typed `emit(name, detail)` as its third argument, and the element's `addEventListener` types each declared event's `detail`. Events bubble and are composed by default; `bubbles`, `composed` and `cancelable` change the flags.

## 0.5.0

### Minor Changes

- [#20](https://github.com/SurgiJS/surgijs/pull/20) [`887ce52`](https://github.com/SurgiJS/surgijs/commit/887ce52b03228868f5cf0981d739d03745da1018) Thanks [@banzalik](https://github.com/banzalik)! - Hot module replacement updates components in place. Defining an already defined tag swaps in the new `render` and re-renders connected instances (their state resets), and the Vite plugin marks modules that call `defineComponent` as hot-updatable, so editing a component no longer reloads the page.

### Patch Changes

- [#24](https://github.com/SurgiJS/surgijs/pull/24) [`8a05670`](https://github.com/SurgiJS/surgijs/commit/8a056700de7d8d64d7f1024eb8272bac4c1b1404) Thanks [@banzalik](https://github.com/banzalik)! - SSR renders nested components, `Show`, `For`, `Switch`/`Match`, `ErrorBoundary` and context on the server. `renderToStream` returns the markup as a `ReadableStream`, sending each chunk as async parts (async components and promises in holes) resolve. Hydration replaces the server content of control-flow regions instead of duplicating it.

## 0.4.0

### Minor Changes

- [#18](https://github.com/SurgiJS/surgijs/pull/18) [`5a2a5a2`](https://github.com/SurgiJS/surgijs/commit/5a2a5a2fda8a33adbda3b66ce1117a9ba69d2def) Thanks [@banzalik](https://github.com/banzalik)! - React DevTools shows the component tree while Vite is serving: the plugin loads the adapter, and production bundles leave it out. Redux DevTools shows each store when the extension is installed, and jumping to a state writes it back.

- [#19](https://github.com/SurgiJS/surgijs/pull/19) [`255a196`](https://github.com/SurgiJS/surgijs/commit/255a196f9ba1cb4785cf83f74f72a78b6072043d) Thanks [@banzalik](https://github.com/banzalik)! - `defineComponent` takes `styles`: one `CSSStyleSheet` per definition, adopted by every instance via `adoptedStyleSheets` instead of a `<style>` per element (falls back to `<style>` where unsupported). `renderToString` and `shadowHTML` take `options.styles` and render it as `<style data-s>`, which the client replaces with the shared sheet on upgrade.

  SSR no longer escapes `<style>` and `<script>` text, which broke selectors such as `a > b` (entities are not decoded in raw text elements); only sequences that would end the element are neutralised, after all fragments are joined. The client compiler does the same for static text in these elements. New `escapeRaw` helper in `@surgijs/core/server`.

  `<s-button>` uses the shared stylesheet.

## 0.3.1

### Patch Changes

- [#13](https://github.com/SurgiJS/surgijs/pull/13) [`5f9acba`](https://github.com/SurgiJS/surgijs/commit/5f9acba735bb8a0ff91821cf2e5d21977d6253f1) Thanks [@banzalik](https://github.com/banzalik)! - `renderToString` and `shadowHTML` take `options`: `children` renders light DOM after the declarative shadow root (slotted content), `delegatesFocus` adds `shadowrootdelegatesfocus`.

## 0.3.0

### Patch Changes

- [#12](https://github.com/SurgiJS/surgijs/pull/12) [`8d42848`](https://github.com/SurgiJS/surgijs/commit/8d428485fb77fa17092a88d7302e083d0db3148e) Thanks [@banzalik](https://github.com/banzalik)! - Document that a `For` key renders its row once and how to show changed content (signals in the row, or values in the key).

## 0.2.1

### Patch Changes

- [#8](https://github.com/SurgiJS/surgijs/pull/8) [`6dea087`](https://github.com/SurgiJS/surgijs/commit/6dea0878e45df1d710ac3763bec3c2c1c7f90b1c) Thanks [@banzalik](https://github.com/banzalik)! - Errors thrown while a binding updates reach the nearest `ErrorBoundary` instead of escaping `flush`.

- [#8](https://github.com/SurgiJS/surgijs/pull/8) [`6dea087`](https://github.com/SurgiJS/surgijs/commit/6dea0878e45df1d710ac3763bec3c2c1c7f90b1c) Thanks [@banzalik](https://github.com/banzalik)! - Bindings re-collect their sources on every run, so attributes and text that read signals through a helper or a prop getter with a condition (`cond() ? a() : b()`) keep updating after the branch switches. Bundles that do not use `bind` no longer include it.

- [#8](https://github.com/SurgiJS/surgijs/pull/8) [`6dea087`](https://github.com/SurgiJS/surgijs/commit/6dea0878e45df1d710ac3763bec3c2c1c7f90b1c) Thanks [@banzalik](https://github.com/banzalik)! - Custom elements dispose their render root one microtask after disconnecting, and only when they are still disconnected. Moving an element (for example a `For` reorder) keeps its state and skips the re-render.

- [#10](https://github.com/SurgiJS/surgijs/pull/10) [`aece323`](https://github.com/SurgiJS/surgijs/commit/aece3233d6eec8c2b1438244439e735007ffc1c7) Thanks [@banzalik](https://github.com/banzalik)! - The runtime is published as `@surgijs/core` (npm refuses the unscoped `surgijs`). Import from `@surgijs/core`, set `"jsxImportSource": "@surgijs/core"`, and the compiler now emits `@surgijs/core` imports by default; 0.2.0 of the compiler still defaults to `surgijs`, so pass `moduleName: '@surgijs/core'` there.

- [#8](https://github.com/SurgiJS/surgijs/pull/8) [`6dea087`](https://github.com/SurgiJS/surgijs/commit/6dea0878e45df1d710ac3763bec3c2c1c7f90b1c) Thanks [@banzalik](https://github.com/banzalik)! - `deferMount` gives every held-back effect its first run before it rethrows the first error, so one throwing `onMount` no longer silences the effects after it.

- [#8](https://github.com/SurgiJS/surgijs/pull/8) [`6dea087`](https://github.com/SurgiJS/surgijs/commit/6dea0878e45df1d710ac3763bec3c2c1c7f90b1c) Thanks [@banzalik](https://github.com/banzalik)! - A computation that disposes its own root while running stays unlinked from its sources instead of being kept alive by them.

- [#8](https://github.com/SurgiJS/surgijs/pull/8) [`6dea087`](https://github.com/SurgiJS/surgijs/commit/6dea0878e45df1d710ac3763bec3c2c1c7f90b1c) Thanks [@banzalik](https://github.com/banzalik)! - `flush` throws `Infinite update loop` after 100 000 rounds of computations that keep re-queuing each other, instead of hanging the page. The dropped computations run again on their next change.

- [#8](https://github.com/SurgiJS/surgijs/pull/8) [`6dea087`](https://github.com/SurgiJS/surgijs/commit/6dea0878e45df1d710ac3763bec3c2c1c7f90b1c) Thanks [@banzalik](https://github.com/banzalik)! - `For` keeps tracking every row when a row render throws, so the rows dispose with the list instead of staying subscribed to their signals.

- [#8](https://github.com/SurgiJS/surgijs/pull/8) [`6dea087`](https://github.com/SurgiJS/surgijs/commit/6dea0878e45df1d710ac3763bec3c2c1c7f90b1c) Thanks [@banzalik](https://github.com/banzalik)! - `Show` and `Match` render a function child again when its truthy `when` value changes, so the child never shows a stale value. Static children stay mounted while the condition stays true. Each `Show` and `Switch` uses one memo instead of two.

- [#8](https://github.com/SurgiJS/surgijs/pull/8) [`6dea087`](https://github.com/SurgiJS/surgijs/commit/6dea0878e45df1d710ac3763bec3c2c1c7f90b1c) Thanks [@banzalik](https://github.com/banzalik)! - A reactive `style` object clears the properties that the next object leaves out.

- [#8](https://github.com/SurgiJS/surgijs/pull/8) [`6dea087`](https://github.com/SurgiJS/surgijs/commit/6dea0878e45df1d710ac3763bec3c2c1c7f90b1c) Thanks [@banzalik](https://github.com/banzalik)! - Disposing many computations or bindings that share one signal takes linear time: each observer keeps an index hint into its longest observer list. Clearing 20 000 rows bound to one selection signal drops from about 150 ms to about 1 ms of reactive work.

## 0.2.0

### Minor Changes

- [#1](https://github.com/SurgiJS/surgijs/pull/1) [`042a928`](https://github.com/SurgiJS/surgijs/commit/042a928a700d18da70ba44753533086f1827a37f) Thanks [@banzalik](https://github.com/banzalik)! - Faster rows and half the memory per row. Signals with a single observer store it directly, owners keep bindings in a linked list, `bind` collects sources without allocating and takes one reader argument (`bind(node, read, apply, arg?)`), `For` rows act as their own owners, and a first text write goes through `textContent`. The compiler hoists readers of one getter and keeps closures for readers of several.
