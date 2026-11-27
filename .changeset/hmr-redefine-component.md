---
"@surgijs/core": patch
"@surgijs/compiler": patch
---

Hot module replacement updates components in place. Defining an already defined tag swaps in the new `render` and re-renders connected instances, and the Vite plugin marks modules that call `defineComponent` as hot-updatable, so editing a component no longer reloads the page.
