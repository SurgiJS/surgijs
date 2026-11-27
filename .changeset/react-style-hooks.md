---
"@surgijs/core": minor
"@surgijs/compiler": minor
---

Hooks take React-style dependency lists. `useEffect(fn, [a, b])` reruns only when `a` or `b` changes and `[]` runs it once after mount; `useMemo(fn, [a])` recomputes only when `a` changes. In `.tsx`/`.jsx` files the compiler turns the array into `() => [a(), b()]` so the getters are tracked; outside compiled files pass that function or an array of getters (new `Deps` type).

**Breaking:** the second argument of `useMemo` is now the dependency list instead of the initial value; use `createMemo(fn, init)` for an initial value.

DOM and binding helpers that compiled JSX calls (`template`, `insert`, `bind`, `effect`, `attr`, `className`, `delegate`, …) are exported from the new `@surgijs/core/internal`. Their exports on `@surgijs/core` stay for compiled code and are marked deprecated, so editors steer hand-written code away from them.
