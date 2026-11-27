---
"@surgijs/core": minor
---

`defineEvent<T>(flags?)` declares an event and its `detail` type, and `defineComponent<P, X>(tag, render, schema, { events })` takes those declarations. The render function receives a typed `emit(name, detail)` as its third argument, and the element's `addEventListener` types each declared event's `detail`. Events bubble and are composed by default; `bubbles`, `composed` and `cancelable` change the flags.
