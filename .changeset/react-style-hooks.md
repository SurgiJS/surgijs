---
"@surgijs/core": minor
"@surgijs/compiler": minor
---

Hooks take React-style dependency lists. `useEffect(fn, [a, b])` reruns only when `a` or `b` changes and `[]` runs it once after mount; `useMemo(fn, [a])` recomputes only when `a` changes. In `.tsx`/`.jsx` files the compiler turns the array into `() => [a(), b()]` so the getters are tracked; outside compiled files pass that function or an array of getters (new `Deps` type).

**Breaking:**

- The second argument of `useMemo` is the dependency list instead of the initial value; use `createMemo(fn, init)` for an initial value.
- Helpers that compiled JSX calls (`template`, `insert`, `bind`, `effect`, `attr`, `className`, `delegate`, `spread`, …) moved from `@surgijs/core` to `@surgijs/core/internal`, and the compiler imports them from there. `@surgijs/core` keeps only the application API. Update `@surgijs/compiler` and `@surgijs/core` together.
