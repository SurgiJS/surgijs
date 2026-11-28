---
"@surgijs/core": minor
---

Development builds print `console.warn` messages for five silent mistakes: a tag already defined by another copy of the library, a signal written inside `createMemo` or a binding, `For` over objects without `by`, a prop read in the component body outside a reactive context, and an effect that keeps rescheduling itself. The checks sit behind `process.env.NODE_ENV !== 'production'` and leave no trace in a production bundle, which the size budgets confirm. The package build keeps that expression so consuming bundlers decide.
