# @surgijs/compiler

JSX compiler for [SurgiJS](https://github.com/SurgiJS/surgijs). It hoists static markup into templates, turns dynamic expressions into direct bindings and emits source maps. It parses with [oxc-parser](https://oxc.rs), so it works with any TypeScript version, including TypeScript 7.

```bash
npm i -D @surgijs/compiler
```

```ts
// vite.config.ts
import surgi from '@surgijs/compiler/vite';

export default { plugins: [surgi()] };
```

```ts
// esbuild
import surgi from '@surgijs/compiler/esbuild';

await build({ entryPoints: ['src/main.ts'], bundle: true, plugins: [surgi()] });
```

```ts
import { compile } from '@surgijs/compiler';

const { code, map } = compile(source, { filename: 'app.tsx', generate: 'dom' });
```

Documentation: https://surgijs.github.io/surgijs/api/compiler

Docs for AI coding agents: [llms.txt](https://surgijs.github.io/surgijs/llms.txt) (index) and [llms-full.txt](https://surgijs.github.io/surgijs/llms-full.txt) (all pages in one file).
