import { fileURLToPath } from 'node:url';
import { defineProject } from 'vitest/config';
import surgi from '../compiler/src/vite.ts';

const core = fileURLToPath(new URL('../surgijs/src/', import.meta.url));
const src = fileURLToPath(new URL('./src/', import.meta.url));

export default defineProject({
  plugins: [surgi()],
  resolve: {
    alias: [
      { find: /^@surgijs\/core$/, replacement: `${core}index.ts` },
      { find: /^@surgijs\/core\/(.*)$/, replacement: `${core}$1.ts` },
      { find: /^@surgijs\/ui$/, replacement: `${src}index.ts` },
      { find: /^@surgijs\/ui\/button$/, replacement: `${src}button/index.ts` },
      { find: /^@surgijs\/ui\/server$/, replacement: `${src}server.ts` },
    ],
  },
  esbuild: { jsx: 'preserve' },
  test: {
    name: 'ui',
    environment: 'happy-dom',
    include: ['test/**/*.test.{ts,tsx}'],
    setupFiles: ['test/setup.ts'],
  },
});
