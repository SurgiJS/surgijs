---
"@surgijs/core": patch
---

Custom elements dispose their render root one microtask after disconnecting, and only when they are still disconnected. Moving an element (for example a `For` reorder) keeps its state and skips the re-render.
