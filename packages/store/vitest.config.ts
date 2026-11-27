import { fileURLToPath } from 'node:url';
import { defineProject } from 'vitest/config';

const src = fileURLToPath(new URL('./src/', import.meta.url));
const core = fileURLToPath(new URL('../surgijs/src/', import.meta.url));

export default defineProject({
  resolve: {
    alias: [
      { find: /^@surgijs\/store$/, replacement: `${src}index.ts` },
      { find: /^@surgijs\/store\/react$/, replacement: `${src}react.ts` },
      { find: /^@surgijs\/store\/core$/, replacement: `${src}core.ts` },
      { find: /^@surgijs\/core$/, replacement: `${core}index.ts` },
    ],
  },
  test: {
    name: 'store',
    environment: 'node',
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
  },
});
