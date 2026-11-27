# SurgiJS

Compiled Web Components on JSX/TSX. The compiler hoists static HTML into templates and turns every dynamic expression into a direct binding, so a state change performs one DOM write per affected binding. The runtime has zero dependencies: about 5.9 KB gzip for everything, about 3.6 KB for a compiled counter app.

- Signals with microtask batching, memos, effects, ownership and context.
- `defineComponent` creates standard custom elements: typed attributes, property reflection, shadow or light DOM, form association.
- `For`, `Show`, `Switch`, `Portal`, `ErrorBoundary`, `createResource`.
- SSR to declarative shadow DOM with nested components, control flow, streaming (`renderToStream`) and hydration that adopts server nodes.
- Vite / Rollup and esbuild plugins with source maps.

## Install

```bash
npm i @surgijs/core
npm i -D @surgijs/compiler
```

```ts
// vite.config.ts
import surgi from '@surgijs/compiler/vite';

export default { plugins: [surgi()] };
```

```json
// tsconfig.json
{ "compilerOptions": { "jsx": "react-jsx", "jsxImportSource": "@surgijs/core" } }
```

## Counter

```tsx
import { defineComponent, useEffect, useState, type ReactiveProps } from '@surgijs/core';

export interface CounterProps {
  step?: number;
  title?: string;
}

export const Counter = (props: ReactiveProps<CounterProps>) => {
  const [count, setCount] = useState(0);
  const { title, step } = props;
  useEffect(() => {
    console.log(`Title updated: ${title}`);
    return () => console.log('Cleanup effect');
  });
  return (
    <div class="card">
      <h3>{title ?? 'Counter'}</h3>
      <p>Value: {count}</p>
      <button onClick={() => setCount((c) => c + (step() ?? 1))}>Add</button>
    </div>
  );
};

export const MyCounter = defineComponent('my-counter', Counter, { step: Number, title: String });
```

```html
<my-counter title="Clicks" step="2"></my-counter>
```

Props are getters. JSX reads them reactively (`{title}`); plain TypeScript code calls them (`step()`).

## Benchmark

Changing every label, ms, headless Chrome 157 ([method and full results](https://surgijs.github.io/surgijs/guide/performance)):

| Library | 1 000 rows | 10 000 rows |
| --- | ---: | ---: |
| Native | 0.34 | 3.48 |
| **SurgiJS** | **0.44** | **4.25** |
| lit-html 3.3 | 0.53 | 4.90 |
| FAST Element 3.1 | 0.58 | 6.83 |
| Inferno 10 | 0.75 | 7.76 |
| Solid 1.9 | 0.77 | 7.45 |
| React 19 | 1.23 | 11.19 |
| Svelte 5 | 1.36 | 8.83 |
| Vue 3 | 1.71 | 18.52 |

Run it locally with `pnpm bench` (`pnpm bench surgijs solid --rows 10000` for a subset).

## Packages

| Package | Contents |
| --- | --- |
| [`@surgijs/core`](packages/surgijs) | runtime: `@surgijs/core`, `@surgijs/core/server`, `@surgijs/core/hydrate`, `@surgijs/core/jsx-runtime` |
| [`@surgijs/compiler`](packages/compiler) | `compile()`, `@surgijs/compiler/vite`, `@surgijs/compiler/esbuild` |
| [`@surgijs/store`](packages/store) | framework-agnostic store: one object, lazy remotes, deep-equal watches |
| [`@surgijs/ui`](packages/ui) | accessible web components themed with CSS custom properties, with SSR |

## Links

- Documentation: https://surgijs.github.io/surgijs/
- Coming from React: https://surgijs.github.io/surgijs/guide/from-react
- Playground: https://surgijs.github.io/surgijs/playground/ ([`apps/playground`](apps/playground))
- Storybook: https://surgijs.github.io/surgijs/storybook/ ([`apps/storybook`](apps/storybook))
- Contributing: [CONTRIBUTING.md](CONTRIBUTING.md)

## License

[MIT](LICENSE)
