---
'@surgijs/core': patch
---

Template markup is now parsed through a `surgijs` Trusted Types policy, so SurgiJS works under `require-trusted-types-for 'script'`. Add `surgijs` to the CSP `trusted-types` directive. Without Trusted Types, or if the policy is refused, nothing changes.
