# SSR and hydration

## Server output

Compile server modules with `generate: 'ssr'`. With the Vite plugin, an import with the `?ssr` query does this per module:

```ts
import { renderToString } from '@surgijs/core/server';
import { Counter } from './counter.tsx?ssr';

const html = renderToString('my-counter', Counter, { title: 'Clicks', step: 2 });
// <my-counter title="Clicks" step="2"><template shadowrootmode="open"><div class="card">…</div></template></my-counter>
```

The SSR output is a tree of parts that never touches a DOM. Text holes escape their values, so any markup you pass through a hole is escaped. `shadowHTML(tag, inner, attrs, options)` builds the declarative shadow DOM wrapper for custom markup. `shadowHTML` and `renderToString` both take `options.children`, light DOM markup placed after the template and projected into slots (it is not escaped), and `options.delegatesFocus`, which renders `shadowrootdelegatesfocus` to match `attachShadow({ delegatesFocus: true })`.

## Nested components

A component used inside another component renders on the server too. Its props are getters, as on the client, and its children are passed as a function:

```tsx
export const Panel = (props: ReactiveProps<{ title?: string }>) => (
  <section>
    <h2>{props.title}</h2>
    {props.children}
  </section>
);
```

`Show`, `Switch`/`Match`, `For` and `ErrorBoundary` render on the server with the same props as on the client. `Portal` renders nothing, because its content mounts into the live document. Context works: a `Provider` value reaches every component rendered inside it, including components rendered later by a stream.

## Streaming

`renderToString` returns the whole document at once and throws if a part is async. `renderToStream` returns a `ReadableStream` of HTML chunks. The shell goes out first, then each run of markup up to an async value, which is sent when it resolves:

```ts
import { renderToStream } from '@surgijs/core/server';
import { Page } from './page.tsx?ssr';

const stream = renderToStream('my-page', Page, { title: 'Clicks' });
return new Response(stream, { headers: { 'content-type': 'text/html; charset=utf-8' } });
```

An async component returns a promise, and a text hole can hold a promise. Both wait for the stream:

```tsx
export const Latest = async () => {
  const post = await loadPost();
  return <article>{post.title}</article>;
};
```

Reactive context is read while a component runs, so read it before the first `await`: after an `await` the component no longer sees its provider. Async siblings start together, so a list of async components starts all of them at once; bound the list in your data layer if the backend cannot take that many requests. Cancelling the stream stops it at the next chunk boundary. A part that is already waiting on a promise is not interrupted, and its output is dropped.

`ReadableStream` and `Response` are web standards, so the same code runs in a route handler (Next.js, for example) or in an endpoint of any framework that returns a `Response`.

Pass the same CSS as `options.styles` (string or array) and the server renders it as `<style data-s>` inside the shadow root, so the component is styled before JavaScript runs. On upgrade the component removes those elements and adopts its shared stylesheet instead. CSS is written as is: only sequences that would end the element are neutralised, after all pieces are joined (`</style`, and in scripts also `</script` and `<script`, written as `<\/…` and `\u003c…`; `i<scripts.length` is left alone). Inside `<svg>` these elements are not raw text, so they get ordinary escaping. The same holds for `<style>` and `<script>` written in JSX, where entities in the text are not decoded by the browser, so `a > b` is never turned into `a &gt; b`.

## Hydration

```ts
import { enableHydration } from '@surgijs/core/hydrate';
import './counter';

enableHydration();
```

With hydration enabled, a component that connects with an existing shadow root adopts its nodes: templates claim the server elements, text bindings take over server text nodes (splitting merged text where needed), and event delegation attaches to the adopted elements. Updates after hydration write into the same nodes.

`disableHydration()` restores client rendering. Without hydration a component replaces any prefilled root content.
