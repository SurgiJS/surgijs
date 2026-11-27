# Getting started

## Install

```bash
npm i @surgijs/core
npm i -D @surgijs/compiler
```

`@surgijs/core` is the runtime. `@surgijs/compiler` turns JSX into DOM code at build time. It parses source with [oxc-parser](https://oxc.rs), so it has no TypeScript peer dependency and works with TypeScript 5, 6 and 7.

## Build plugin

Vite or Rollup:

```ts
// vite.config.ts
import surgi from '@surgijs/compiler/vite';

export default { plugins: [surgi()] };
```

While Vite is serving, the plugin loads React DevTools support. A production build leaves it out. With the extension installed, the component tree shows up; nothing is imported by hand.

esbuild:

```ts
import { build } from 'esbuild';
import surgi from '@surgijs/compiler/esbuild';

await build({ entryPoints: ['src/main.ts'], bundle: true, plugins: [surgi()] });
```

Both plugins compile `.jsx` and `.tsx` files outside `node_modules`. The `include` option takes a RegExp or a predicate for other layouts.

## TypeScript

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@surgijs/core",
    "moduleResolution": "bundler",
    "strict": true
  }
}
```

`jsxImportSource` gives editors the SurgiJS JSX types. The build plugin replaces JSX before TypeScript or esbuild sees it.

## First component

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

Props arrive as getters. Inside JSX and template literals the compiler inserts the call, so `{title}` reads the current title and subscribes to it. In plain TypeScript logic call the getter explicitly, as in `step()`.

The shadow root renders `<div class="card"><h3>Counter</h3><p>Value: 0</p><button>Add</button></div>`. A click updates one text node.
