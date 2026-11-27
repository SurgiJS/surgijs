---
"@surgijs/compiler": minor
---

The compiler parses with `oxc-parser` instead of the TypeScript compiler API. `typescript` is no longer a peer dependency, so TypeScript 7 (which has no JS API) works without a pin. Output for valid code is unchanged. Input with syntax errors (unclosed JSX or template literals, TypeScript-only syntax in `.jsx` files) is no longer rewritten; the bundler reports the syntax error instead.
