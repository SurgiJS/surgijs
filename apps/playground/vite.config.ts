import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import surgi from '../../packages/compiler/src/vite.ts';

const runtime = fileURLToPath(new URL('../../packages/surgijs/src/', import.meta.url));
const ui = fileURLToPath(new URL('../../packages/ui/src/', import.meta.url));

export default defineConfig({
  plugins: [surgi()],
  resolve: {
    alias: [
      { find: /^@surgijs\/core$/, replacement: `${runtime}index.ts` },
      { find: /^@surgijs\/core\/(.*)$/, replacement: `${runtime}$1.ts` },
      { find: /^@surgijs\/ui$/, replacement: `${ui}index.ts` },
      { find: /^@surgijs\/ui\/themes\.css$/, replacement: `${ui}themes.css` },
    ],
  },
});
