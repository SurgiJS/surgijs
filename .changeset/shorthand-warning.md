---
"@surgijs/compiler": minor
---

The compiler warns about a shorthand property that names a signal (`{ label }`): it compiles to `label: label()`, so the object keeps the value read at creation. `compile()` returns `warnings`, and the Vite and esbuild plugins report them.
