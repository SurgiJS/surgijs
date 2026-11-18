# SSR and hydration

## Server output

Compile server modules with `generate: 'ssr'`. With the Vite plugin, an import with the `?ssr` query does this per module:

```ts
import { renderToString } from 'surgijs/server';
import { Counter } from './counter.tsx?ssr';

const html = renderToString('my-counter', Counter, { title: 'Clicks', step: 2 });
// <my-counter title="Clicks" step="2"><template shadowrootmode="open"><div class="card">…</div></template></my-counter>
```

The SSR output concatenates strings with `escape` and `attrPart` and never touches a DOM. `shadowHTML(tag, inner, attrs)` builds the declarative shadow DOM wrapper for custom markup.

## Hydration

```ts
import { enableHydration } from 'surgijs/hydrate';
import './counter';

enableHydration();
```

With hydration enabled, a component that connects with an existing shadow root adopts its nodes: templates claim the server elements, text bindings take over server text nodes (splitting merged text where needed), and event delegation attaches to the adopted elements. Updates after hydration write into the same nodes.

`disableHydration()` restores client rendering. Without hydration a component replaces any prefilled root content.
