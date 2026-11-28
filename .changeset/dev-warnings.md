---
"@surgijs/core": minor
---

Development builds print `console.warn` messages for five silent mistakes: a tag already defined by another copy of the library, a signal written inside `createMemo` or a binding, `For` over objects without `by`, a prop read in the component body outside a reactive context, and an effect that keeps rescheduling itself. The checks ship in a separate development build that the `development` export condition selects (Vite and webpack set it in development). The default build has no checks and no reference to `process`, so it still runs unbundled from a CDN, an import map, Node or Deno.
