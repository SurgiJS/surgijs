# @surgijs/astro

[Astro](https://astro.build) integration for [SurgiJS](https://github.com/SurgiJS/surgijs): components render on the server to declarative shadow DOM and hydrate in islands.

```bash
npm i @surgijs/astro @surgijs/core @surgijs/compiler
```

```js
// astro.config.mjs
import surgijs from '@surgijs/astro';
import { defineConfig } from 'astro/config';

export default defineConfig({ integrations: [surgijs()] });
```

```astro
---
import { MyCounter } from '../components/counter.tsx';
---

<MyCounter client:load title="Clicks" />
```

`MyCounter` is the `defineComponent` export of a `.tsx` file. Entry points: `@surgijs/astro` (the integration), `@surgijs/astro/server` and `@surgijs/astro/client` (the renderer Astro loads), `@surgijs/astro/hydrate` (turns hydration on).

Documentation: https://surgijs.github.io/surgijs/guide/astro
