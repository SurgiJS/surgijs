---
"@surgijs/core": patch
---

Bindings re-collect their sources on every run, so attributes and text that read signals through a helper or a prop getter with a condition (`cond() ? a() : b()`) keep updating after the branch switches. Bundles that do not use `bind` no longer include it.
