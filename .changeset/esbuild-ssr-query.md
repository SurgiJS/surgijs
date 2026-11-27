---
"@surgijs/compiler": patch
---

The esbuild plugin compiles `.tsx?ssr` / `.jsx?ssr` imports with `generate: 'ssr'`, like the Vite plugin, so one source can feed both the client and the server bundle.
