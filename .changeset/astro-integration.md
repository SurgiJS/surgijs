---
"@surgijs/astro": minor
"@surgijs/core": minor
"@surgijs/compiler": minor
---

`@surgijs/astro` is an Astro integration that renders `defineComponent` components to declarative shadow DOM and hydrates them in islands. To support it, the Vite plugin takes `generate: 'auto'` (server output in Vite's SSR graph, DOM output elsewhere), and `defineComponent` without a DOM returns a class that carries its tag, render function, schema and options.
