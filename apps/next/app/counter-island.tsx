'use client';

import { useCallback } from 'react';
import '../surgi/client';
import '../surgi/counter';

/**
 * Server markup is a declarative shadow root. Browsers parse it only on the main document parse
 * or in `setHTMLUnsafe`, so on client navigation the markup is inserted with `setHTMLUnsafe`.
 * During hydration the children already exist and are kept, so the element adopts them.
 */
export function CounterIsland({ html }: { html: string }) {
  const markup = typeof window === 'undefined' ? html : '';
  const attach = useCallback(
    (el: HTMLDivElement | null) => {
      if (el && !el.hasChildNodes()) el.setHTMLUnsafe(html);
    },
    [html],
  );
  return <div ref={attach} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: markup }} />;
}
