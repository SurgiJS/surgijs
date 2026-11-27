---
"@surgijs/core": minor
"@surgijs/compiler": patch
"@surgijs/ui": patch
---

`defineComponent` takes `styles`: one `CSSStyleSheet` per definition, adopted by every instance via `adoptedStyleSheets` instead of a `<style>` per element (falls back to `<style>` where unsupported). `renderToString` and `shadowHTML` take `options.styles` and render it as `<style data-s>`, which the client replaces with the shared sheet on upgrade.

SSR no longer escapes `<style>` and `<script>` text, which broke selectors such as `a > b` (entities are not decoded in raw text elements); only sequences that would end the element are neutralised, after all fragments are joined. The client compiler does the same for static text in these elements. New `escapeRaw` helper in `@surgijs/core/server`.

`<s-button>` uses the shared stylesheet.
