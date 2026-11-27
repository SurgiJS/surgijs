# @surgijs/compiler

## 0.5.0

### Minor Changes

- [#20](https://github.com/SurgiJS/surgijs/pull/20) [`887ce52`](https://github.com/SurgiJS/surgijs/commit/887ce52b03228868f5cf0981d739d03745da1018) Thanks [@banzalik](https://github.com/banzalik)! - Hot module replacement updates components in place. Defining an already defined tag swaps in the new `render` and re-renders connected instances (their state resets), and the Vite plugin marks modules that call `defineComponent` as hot-updatable, so editing a component no longer reloads the page.

### Patch Changes

- [#24](https://github.com/SurgiJS/surgijs/pull/24) [`8a05670`](https://github.com/SurgiJS/surgijs/commit/8a056700de7d8d64d7f1024eb8272bac4c1b1404) Thanks [@banzalik](https://github.com/banzalik)! - SSR renders nested components, `Show`, `For`, `Switch`/`Match`, `ErrorBoundary` and context on the server. `renderToStream` returns the markup as a `ReadableStream`, sending each chunk as async parts (async components and promises in holes) resolve. Hydration replaces the server content of control-flow regions instead of duplicating it.

## 0.4.0

### Minor Changes

- [#18](https://github.com/SurgiJS/surgijs/pull/18) [`5a2a5a2`](https://github.com/SurgiJS/surgijs/commit/5a2a5a2fda8a33adbda3b66ce1117a9ba69d2def) Thanks [@banzalik](https://github.com/banzalik)! - React DevTools shows the component tree while Vite is serving: the plugin loads the adapter, and production bundles leave it out. Redux DevTools shows each store when the extension is installed, and jumping to a state writes it back.

- [#27](https://github.com/SurgiJS/surgijs/pull/27) [`37d03b6`](https://github.com/SurgiJS/surgijs/commit/37d03b68a89d3ca0651551f94f93f0245ee07170) Thanks [@banzalik](https://github.com/banzalik)! - The compiler warns about a shorthand property that names a signal (`{ label }`): it compiles to `label: label()`, so the object keeps the value read at creation. `compile()` returns `warnings`, and the Vite and esbuild plugins report them.

### Patch Changes

- [#19](https://github.com/SurgiJS/surgijs/pull/19) [`255a196`](https://github.com/SurgiJS/surgijs/commit/255a196f9ba1cb4785cf83f74f72a78b6072043d) Thanks [@banzalik](https://github.com/banzalik)! - `defineComponent` takes `styles`: one `CSSStyleSheet` per definition, adopted by every instance via `adoptedStyleSheets` instead of a `<style>` per element (falls back to `<style>` where unsupported). `renderToString` and `shadowHTML` take `options.styles` and render it as `<style data-s>`, which the client replaces with the shared sheet on upgrade.

  SSR no longer escapes `<style>` and `<script>` text, which broke selectors such as `a > b` (entities are not decoded in raw text elements); only sequences that would end the element are neutralised, after all fragments are joined. The client compiler does the same for static text in these elements. New `escapeRaw` helper in `@surgijs/core/server`.

  `<s-button>` uses the shared stylesheet.

## 0.3.1

### Patch Changes

- [#13](https://github.com/SurgiJS/surgijs/pull/13) [`6b4907a`](https://github.com/SurgiJS/surgijs/commit/6b4907a97b72058ad80438476611344b59379627) Thanks [@banzalik](https://github.com/banzalik)! - The esbuild plugin compiles `.tsx?ssr` / `.jsx?ssr` imports with `generate: 'ssr'`, like the Vite plugin, so one source can feed both the client and the server bundle.

## 0.3.0

### Minor Changes

- [#14](https://github.com/SurgiJS/surgijs/pull/14) [`286da21`](https://github.com/SurgiJS/surgijs/commit/286da219ac4496e65a1d3efc4e38876d12d6a73e) Thanks [@banzalik](https://github.com/banzalik)! - The compiler parses with `oxc-parser` instead of the TypeScript compiler API. `typescript` is no longer a peer dependency, so TypeScript 7 (which has no JS API) works without a pin. Output for valid code is unchanged. Input with syntax errors (unclosed JSX or template literals, TypeScript-only syntax in `.jsx` files) is no longer rewritten; the bundler reports the syntax error instead.

### Patch Changes

- [#12](https://github.com/SurgiJS/surgijs/pull/12) [`900c5ad`](https://github.com/SurgiJS/surgijs/commit/900c5adf4b533f7b2e6455625b8a1c370c674b09) Thanks [@banzalik](https://github.com/banzalik)! - The Vite plugin sets `oxc.jsx: 'preserve'` on Vite 8 (Rolldown) instead of the deprecated `esbuild` option.

## 0.2.1

### Patch Changes

- [#8](https://github.com/SurgiJS/surgijs/pull/8) [`6dea087`](https://github.com/SurgiJS/surgijs/commit/6dea0878e45df1d710ac3763bec3c2c1c7f90b1c) Thanks [@banzalik](https://github.com/banzalik)! - Parenthesized comma expressions and object literals keep their parentheses in compiled output, so `{(log(), n())}` and `{({ v: n() })}` no longer split into extra arguments or turn into a block.

- [#10](https://github.com/SurgiJS/surgijs/pull/10) [`aece323`](https://github.com/SurgiJS/surgijs/commit/aece3233d6eec8c2b1438244439e735007ffc1c7) Thanks [@banzalik](https://github.com/banzalik)! - The runtime is published as `@surgijs/core` (npm refuses the unscoped `surgijs`). Import from `@surgijs/core`, set `"jsxImportSource": "@surgijs/core"`, and the compiler now emits `@surgijs/core` imports by default; 0.2.0 of the compiler still defaults to `surgijs`, so pass `moduleName: '@surgijs/core'` there.

- [#8](https://github.com/SurgiJS/surgijs/pull/8) [`6dea087`](https://github.com/SurgiJS/surgijs/commit/6dea0878e45df1d710ac3763bec3c2c1c7f90b1c) Thanks [@banzalik](https://github.com/banzalik)! - The esbuild plugin skips files in `node_modules` and accepts the `include` option, as documented and as the Vite plugin does.

## 0.2.0

### Minor Changes

- [#1](https://github.com/SurgiJS/surgijs/pull/1) [`042a928`](https://github.com/SurgiJS/surgijs/commit/042a928a700d18da70ba44753533086f1827a37f) Thanks [@banzalik](https://github.com/banzalik)! - Faster rows and half the memory per row. Signals with a single observer store it directly, owners keep bindings in a linked list, `bind` collects sources without allocating and takes one reader argument (`bind(node, read, apply, arg?)`), `For` rows act as their own owners, and a first text write goes through `textContent`. The compiler hoists readers of one getter and keeps closures for readers of several.
