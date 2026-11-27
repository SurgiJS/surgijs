import Link from 'next/link';
import { renderToString } from '@surgijs/core/server';
import * as ui from '../surgi/counter.tsx?ssr';
import { counterStyles } from '../surgi/styles';
import { CounterIsland } from './counter-island';

export default function Home() {
  const html = renderToString('my-counter', ui.Counter!, { title: 'Server', step: 2 }, { styles: counterStyles });
  return (
    <main>
      <h1>SurgiJS in Next.js App Router</h1>
      <CounterIsland html={html} />
      <p>
        <Link href="/second">Client navigation to a second page</Link>
      </p>
    </main>
  );
}
