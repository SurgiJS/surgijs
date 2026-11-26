---
"surgijs": patch
---

`deferMount` gives every held-back effect its first run before it rethrows the first error, so one throwing `onMount` no longer silences the effects after it.
