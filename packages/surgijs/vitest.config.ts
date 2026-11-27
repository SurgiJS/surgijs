import { fileURLToPath } from 'node:url';
import { defineProject } from 'vitest/config';
import surgi from '../compiler/src/vite.ts';

const src = fileURLToPath(new URL('./src/', import.meta.url));

export default defineProject({
  plugins: [surgi()],
  resolve: {
    alias: [
      { find: /^@surgijs\/core$/, replacement: `${src}index.ts` },
      { find: /^@surgijs\/core\/(.*)$/, replacement: `${src}$1.ts` },
    ],
  },
  esbuild: { jsx: 'preserve' },
  test: {
    name: 'surgijs',
    environment: 'happy-dom',
    include: ['test/**/*.test.{ts,tsx}'],
  },
});
