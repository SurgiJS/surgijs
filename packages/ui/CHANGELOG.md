# @surgijs/ui

## 1.0.0

### Patch Changes

- [#19](https://github.com/SurgiJS/surgijs/pull/19) [`255a196`](https://github.com/SurgiJS/surgijs/commit/255a196f9ba1cb4785cf83f74f72a78b6072043d) Thanks [@banzalik](https://github.com/banzalik)! - `defineComponent` takes `styles`: one `CSSStyleSheet` per definition, adopted by every instance via `adoptedStyleSheets` instead of a `<style>` per element (falls back to `<style>` where unsupported). `renderToString` and `shadowHTML` take `options.styles` and render it as `<style data-s>`, which the client replaces with the shared sheet on upgrade.

  SSR no longer escapes `<style>` and `<script>` text, which broke selectors such as `a > b` (entities are not decoded in raw text elements); only sequences that would end the element are neutralised, after all fragments are joined. The client compiler does the same for static text in these elements. New `escapeRaw` helper in `@surgijs/core/server`.

  `<s-button>` uses the shared stylesheet.

- Updated dependencies [[`5a2a5a2`](https://github.com/SurgiJS/surgijs/commit/5a2a5a2fda8a33adbda3b66ce1117a9ba69d2def), [`255a196`](https://github.com/SurgiJS/surgijs/commit/255a196f9ba1cb4785cf83f74f72a78b6072043d)]:
  - @surgijs/core@0.4.0
