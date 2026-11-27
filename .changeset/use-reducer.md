---
"@surgijs/core": minor
"@surgijs/compiler": minor
---

`useReducer(reducer, init)` returns `[state, dispatch]`: each `dispatch(action)` stores `reducer(state, action)`. The compiler reads `state` as a value inside JSX, like `useState`. The hook is built on `useState`, so an app that does not call it leaves it out of the bundle.
