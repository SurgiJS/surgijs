import Link from 'next/link';
import { renderToString } from '@surgijs/core/server';
import * as ui from '../../surgi/counter.tsx?ssr';
import { counterStyles } from '../../surgi/styles';
import { CounterIsland } from '../counter-island';

export default function Second() {
  const html = renderToString('my-counter', ui.Counter!, { title: 'Second page', step: 5 }, { styles: counterStyles });
  return (
    <main>
      <h1>Second page</h1>
      <CounterIsland html={html} />
      <p>
        <Link href="/">Back</Link>
      </p>
    </main>
  );
}
