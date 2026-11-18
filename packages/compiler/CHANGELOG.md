# @surgijs/compiler

## 0.2.0

### Minor Changes

- [#1](https://github.com/SurgiJS/surgijs/pull/1) [`042a928`](https://github.com/SurgiJS/surgijs/commit/042a928a700d18da70ba44753533086f1827a37f) Thanks [@banzalik](https://github.com/banzalik)! - Faster rows and half the memory per row. Signals with a single observer store it directly, owners keep bindings in a linked list, `bind` collects sources without allocating and takes one reader argument (`bind(node, read, apply, arg?)`), `For` rows act as their own owners, and a first text write goes through `textContent`. The compiler hoists readers of one getter and keeps closures for readers of several.
