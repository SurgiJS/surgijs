# @surgijs/compiler

## compile(code, options?)

```ts
import { compile } from '@surgijs/compiler';

const { code, changed, map } = compile(source, { filename: 'app.tsx' });
```

| Option | Default | Meaning |
| --- | --- | --- |
| `filename` | `'input.tsx'` | used for parsing mode and the source map |
| `moduleName` | `'@surgijs/core'` | runtime package of the generated imports: `<moduleName>/internal` on the client, `<moduleName>/server` for SSR |
| `generate` | `'dom'` | `'ssr'` emits element trees for `<moduleName>/server`: nested components are calls, holes escape text. The Vite plugin also takes `'auto'`: modules in Vite's SSR graph compile for the server, the rest for the DOM |
| `sourceMap` | `true` | returns a V3 source map as JSON in `map` |

A file without JSX comes back unchanged with `changed: false`.

## @surgijs/compiler/vite

```ts
import surgi from '@surgijs/compiler/vite';

surgi({ include, moduleName, generate, devtools });
```

`devtools` loads `<moduleName>/devtools` while `vite` is serving. It is on for `@surgijs/core`. A custom `moduleName` that exports `./devtools` turns it on with `devtools: true`.

Runs before other transforms (`enforce: 'pre'`) and sets `esbuild.jsx` to `preserve`. Imports with a `?ssr` query compile for the server.

## @surgijs/compiler/esbuild

```ts
import surgi from '@surgijs/compiler/esbuild';

surgi({ include, moduleName, generate });
```

Loads `.jsx` / `.tsx` files, compiles them and attaches an inline source map.

## Warnings

In a file with JSX, a shorthand property that names a getter (`{ label }`) compiles to `label: label()`: the object holds the value read at creation and later updates do not reach it. `compile()` returns such cases in `warnings` (`message`, `line`, `column`); the Vite plugin reports them through `this.warn` and the esbuild plugin through `warnings`. Write `label: () => label()` to keep the value live, or `label: label()` when the snapshot is intended; neither form warns.

## unwrapGetterReads(code, filename)

The pass that inserts `()` after getter reads (`useState`/`createSignal` values, memos, context values, props). The compiler runs it first; it is exported for tools that need the same rewrite.
