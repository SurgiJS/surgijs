---
layout: home

hero:
  name: SurgiJS
  text: Compiled Web Components on JSX
  tagline: Templates compile to cloned DOM and direct bindings. Each binding writes to the DOM once per change. The runtime has zero dependencies and weighs about 5.9 KB gzip.
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: Benchmark
      link: /guide/performance

features:
  - title: Fine-grained updates
    details: Signals drive bindings directly. A label change rewrites one text node.
  - title: Standard custom elements
    details: defineComponent produces a real custom element with typed attributes, property reflection, shadow or light DOM and form association.
  - title: Small and tree-shakable
    details: A counter app compiles to about 3.6 KB gzip. A bundle that uses only useState is under 1 KB.
  - title: SSR with declarative shadow DOM
    details: The compiler emits string concatenation for the server and the client adopts existing nodes on hydration.
---
