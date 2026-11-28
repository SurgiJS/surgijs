---
"@surgijs/store": patch
---

`store.subscribe` registers the subscription before it starts loading the remotes the selector reads. A load that changes state right away (status turns pending, a synchronous fetch settles) now reaches the new subscriber. Before, the Vue and Angular adapters started from the stale value: `fromStatus` showed `isPending: false` during the first load, and `fromStore` stayed `undefined` after a synchronous fetch.
