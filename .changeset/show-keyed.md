---
"surgijs": patch
---

`Show` and `Match` render a function child again when its truthy `when` value changes, so the child never shows a stale value. Static children stay mounted while the condition stays true. Each `Show` and `Switch` uses one memo instead of two.
