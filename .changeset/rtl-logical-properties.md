---
"@surgijs/ui": patch
---

`<s-button>` styles use logical CSS properties (`padding-inline`, `border-inline-end-color`), so it follows `dir="rtl"` without overrides. The Storybook toolbar has a direction switch, and the e2e suite has RTL screenshots and a layout check.
