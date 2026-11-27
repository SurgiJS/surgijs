# Next.js App Router

The [`apps/next`](https://github.com/SurgiJS/surgijs/tree/main/apps/next) example renders SurgiJS components in a Server Component, sends the declarative shadow DOM with the page, and hydrates the element in a Client Component. It uses webpack (`next dev --webpack`, `next build --webpack`), because the compiler runs as a webpack loader.

## Setup

The compiler runs as a loader for `.tsx` files in the component directory:

```js
// next.config.mjs
export default {
  webpack(config) {
    config.module.rules.unshift({
      test: /\.tsx$/,
      include: path.join(here, 'surgi'),
      enforce: 'pre',
      use: [{ loader: path.join(here, 'loaders/surgi-loader.mjs') }],
    });
    return config;
  },
};
```

The loader calls `compile()` from `@surgijs/compiler`. A module imported with `?ssr` compiles with `generate: 'ssr'`, every other module for the DOM. This is the same split as the Vite plugin.

Component files start with the pragma that makes TypeScript type their JSX with SurgiJS, so the rest of the app keeps React's JSX types:

```tsx
/** @jsxImportSource @surgijs/core */
import { defineComponent, useState, type ReactiveProps } from '@surgijs/core';
```

## Server Component

Import the server build, render it, and pass the markup to a Client Component:

```tsx
// app/page.tsx
import { renderToString } from '@surgijs/core/server';
import * as ui from '../surgi/counter.tsx?ssr';
import { counterStyles } from '../surgi/styles';
import { CounterIsland } from './counter-island';

export default function Home() {
  const html = renderToString('my-counter', ui.Counter!, { title: 'Server', step: 2 }, { styles: counterStyles });
  return <CounterIsland html={html} />;
}
```

`renderToString` runs in the Server Component, so the page contains `<my-counter><template shadowrootmode="open">…</template></my-counter>` before any JavaScript loads.

## Client island

The island is a Client Component that loads the DOM build and enables hydration:

```tsx
// app/counter-island.tsx
'use client';

import { useCallback } from 'react';
import '../surgi/client'; // enableHydration()
import '../surgi/counter';

export function CounterIsland({ html }: { html: string }) {
  const markup = typeof window === 'undefined' ? html : '';
  const attach = useCallback((el: HTMLDivElement | null) => {
    if (el && !el.hasChildNodes()) el.setHTMLUnsafe(html);
  }, [html]);
  return <div ref={attach} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: markup }} />;
}
```

On the first load the server markup is kept, and the element adopts it when the module loads. On client navigation React inserts the wrapper empty, and `setHTMLUnsafe` parses the declarative shadow root. `innerHTML` would not parse it and would log a warning.

## Running

Build the packages once from the repository root, then run the example:

```bash
pnpm build
pnpm --filter @surgijs/next-example dev
```
