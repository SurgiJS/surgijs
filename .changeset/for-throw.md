---
"surgijs": patch
---

`For` keeps tracking every row when a row render throws, so the rows dispose with the list instead of staying subscribed to their signals.
