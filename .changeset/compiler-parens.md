---
"@surgijs/compiler": patch
---

Parenthesized comma expressions and object literals keep their parentheses in compiled output, so `{(log(), n())}` and `{({ v: n() })}` no longer split into extra arguments or turn into a block.
