# @surgijs/compiler

## compile(code, options?)

```ts
import { compile } from '@surgijs/compiler';

const { code, changed, map } = compile(source, { filename: 'app.tsx' });
```

| Option | Default | Meaning |
| --- | --- | --- |
| `filename` | `'input.tsx'` | used for parsing mode and the source map |
| `moduleName` | `'@surgijs/core'` | runtime module of the generated imports; SSR imports `<moduleName>/server` |
| `generate` | `'dom'` | `'ssr'` emits string concatenation |
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

## unwrapGetterReads(code, filename)

The pass that inserts `()` after getter reads (`useState`/`createSignal` values, memos, context values, props). The compiler runs it first; it is exported for tools that need the same rewrite.
