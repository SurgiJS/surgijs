# Astro

`@surgijs/astro` is an Astro integration that renders SurgiJS components on the server to declarative shadow DOM and hydrates them in islands. The page is styled and readable before any JavaScript loads, and the element adopts the server nodes when its island hydrates.

```bash
npm i @surgijs/astro @surgijs/core @surgijs/compiler
```

```js
// astro.config.mjs
import surgijs from '@surgijs/astro';
import { defineConfig } from 'astro/config';

export default defineConfig({ integrations: [surgijs()] });
```

```json
// tsconfig.json
{ "compilerOptions": { "jsx": "react-jsx", "jsxImportSource": "@surgijs/core" } }
```

Astro 5 and later are supported.

## Components

Write a component as in any other project and import its `defineComponent` export into an `.astro` file:

```tsx
// src/components/counter.tsx
import { defineComponent, useState, type ReactiveProps } from '@surgijs/core';

const Counter = (props: ReactiveProps<{ title?: string; step?: number }>) => {
  const [count, setCount] = useState(0);
  return (
    <div class="card">
      <h3>{props.title}</h3>
      <output>{count}</output>
      <button onClick={() => setCount((c) => c + (props.step() ?? 1))}>Add</button>
      <slot></slot>
    </div>
  );
};

export const MyCounter = defineComponent('my-counter', Counter, { title: String, step: Number }, { styles: '.card { padding: 1rem }' });
```

```astro
---
import { MyCounter } from '../components/counter.tsx';
---

<MyCounter client:load title="Clicks" step={2}>
  <em>Slotted text</em>
</MyCounter>
```

The page contains `<my-counter title="Clicks" step="2"><template shadowrootmode="open">…</template>…</my-counter>`. The integration renders `options.styles` into the shadow root as `<style data-s>`, so the component is styled before it upgrades.

## How it works

- **Compilation.** The integration adds the SurgiJS Vite plugin with `generate: 'auto'`. Modules in Astro's server graph compile for the server (element trees for `@surgijs/core/server`) and modules in the browser graph compile for the DOM. The same `.tsx` file serves both, so no `?ssr` import is needed.
- **Server rendering.** Without a DOM, `defineComponent` returns a class that holds the tag, the render function, the schema and the options. The renderer reads them and calls the streaming renderer of `@surgijs/core/server`, so async components work. Props go to the host as attributes and reach the view as the element would read them: a literal `step="5"` is the number `5`, a `Boolean` prop with an empty value is `true`, and `Object` and `Array` props are JSON.
- **Hydration.** `client:*` directives hydrate as in any Astro island. The integration calls `enableHydration()` before an island runs. Loading the component module defines the custom element, which upgrades the server markup in place.

## Slots

The default slot becomes the light DOM of the host, and a named slot is wrapped in an element that carries the `slot` attribute:

```astro
<s-card client:visible>
  <h2 slot="title">Heading</h2>
  Body text
</s-card>
```

The wrapper is `display: contents`, so it does not change the layout.

## Directives

| Directive | Result |
| --- | --- |
| none | Server markup only. The element still upgrades if any island on the page loads the same module. |
| `client:load`, `client:idle`, `client:visible`, `client:media` | Server markup, then the element adopts it when the directive fires. |
| `client:only="@surgijs/astro"` | No server markup. The island creates the element in the browser. |

## Limits

- A component with `{ shadow: false }` renders its host without content on the server and fills it in the browser. Only shadow DOM components have server markup.
- A closed shadow root renders as an open declarative shadow root on the server. After upgrade the element uses the same root.
- Props that are functions or `undefined` are not passed to the element. Pass data and handle events with `addEventListener` or `defineEvent` on the client.

## Options

```js
surgijs({ include, moduleName, devtools });
```

They go to the Vite plugin (see [`@surgijs/compiler`](/api/compiler)). `generate` is always `'auto'`.

The [`apps/astro`](https://github.com/SurgiJS/surgijs/tree/main/apps/astro) example shows `client:load`, `client:visible`, no directive and `client:only` on one page.
