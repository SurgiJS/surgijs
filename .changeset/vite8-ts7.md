---
"@surgijs/compiler": patch
---

The Vite plugin sets `oxc.jsx: 'preserve'` on Vite 8 (Rolldown) instead of the deprecated `esbuild` option. Loading the compiler with TypeScript 7 now fails with a message that asks for `typescript@6`. The install docs use `@surgijs/core` and `typescript@6`.
