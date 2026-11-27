# @surgijs/core

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
