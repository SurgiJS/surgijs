---
"surgijs": patch
---

`flush` throws `Infinite update loop` after 100 000 rounds of computations that keep re-queuing each other, instead of hanging the page. The dropped computations run again on their next change.
