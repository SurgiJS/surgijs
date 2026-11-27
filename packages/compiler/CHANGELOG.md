# @surgijs/compiler

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
