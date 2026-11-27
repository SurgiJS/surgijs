---
"@surgijs/core": patch
"@surgijs/compiler": patch
---

SSR renders nested components, `Show`, `For`, `Switch`/`Match`, `ErrorBoundary` and context on the server. `renderToStream` returns the markup as a `ReadableStream`, sending each chunk as async parts (async components and promises in holes) resolve. Hydration replaces the server content of control-flow regions instead of duplicating it.
