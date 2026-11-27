# @surgijs/compiler

JSX compiler for [SurgiJS](https://github.com/SurgiJS/surgijs). It hoists static markup into templates, turns dynamic expressions into direct bindings and emits source maps. `typescript` (5.x or 6.x) is its only peer dependency.

```bash
npm i -D @surgijs/compiler typescript@6
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
