---
"surgijs": patch
---

Disposing many computations or bindings that share one signal takes linear time: each observer keeps an index hint into its longest observer list. Clearing 20 000 rows bound to one selection signal drops from about 150 ms to about 1 ms of reactive work.
