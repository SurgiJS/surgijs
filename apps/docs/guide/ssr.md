# SSR and hydration

## Server output

Compile server modules with `generate: 'ssr'`. With the Vite plugin, an import with the `?ssr` query does this per module:

```ts
import { renderToString } from '@surgijs/core/server';
import { Counter } from './counter.tsx?ssr';

const html = renderToString('my-counter', Counter, { title: 'Clicks', step: 2 });
// <my-counter title="Clicks" step="2"><template shadowrootmode="open"><div class="card">…</div></template></my-counter>
```

The SSR output concatenates strings with `escape` and `attrPart` and never touches a DOM. `shadowHTML(tag, inner, attrs, options)` builds the declarative shadow DOM wrapper for custom markup. Both take `options.children`, light DOM markup placed after the template and projected into slots (it is not escaped), and `options.delegatesFocus`, which renders `shadowrootdelegatesfocus` to match `attachShadow({ delegatesFocus: true })`.

Pass the same CSS as `options.styles` (string or array) and the server renders it as `<style data-s>` inside the shadow root, so the component is styled before JavaScript runs. On upgrade the component removes those elements and adopts its shared stylesheet instead. CSS is written as is: only sequences that would end the element are neutralised, after all pieces are joined (`</style`, and in scripts also `</script`, `<script` and `<!--`, written as `<\/…` and `\u003c…`). The same holds for `<style>` and `<script>` written in JSX, where entities in the text are not decoded by the browser, so `a > b` is never turned into `a &gt; b`.

## Hydration

```ts
import { enableHydration } from '@surgijs/core/hydrate';
import './counter';

enableHydration();
```

With hydration enabled, a component that connects with an existing shadow root adopts its nodes: templates claim the server elements, text bindings take over server text nodes (splitting merged text where needed), and event delegation attaches to the adopted elements. Updates after hydration write into the same nodes.

`disableHydration()` restores client rendering. Without hydration a component replaces any prefilled root content.
