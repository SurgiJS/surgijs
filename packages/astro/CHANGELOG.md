# @surgijs/astro

## 0.1.0

### Minor Changes

- [#45](https://github.com/SurgiJS/surgijs/pull/45) [`6664578`](https://github.com/SurgiJS/surgijs/commit/6664578cb4cc1411408ae93ef7557e97a72da01a) Thanks [@banzalik](https://github.com/banzalik)! - `@surgijs/astro` is an Astro integration that renders `defineComponent` components to declarative shadow DOM and hydrates them in islands. To support it, the Vite plugin takes `generate: 'auto'` (server output in Vite's SSR graph, DOM output elsewhere), and `defineComponent` without a DOM returns a class that carries its tag, render function, schema and options.
