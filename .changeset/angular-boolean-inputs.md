---
"@surgijs/ui": patch
---

Boolean inputs of the Angular directives go through `booleanAttribute`, as Angular's own boolean inputs do. `<s-button disabled>` disables the button and `disabled="false"` leaves it enabled; with strict templates both compile.
