import { defineProject } from 'vitest/config';
import { workspaceSources } from '../../tools/vite-workspace.ts';
import surgi from '../compiler/src/vite.ts';

export default defineProject({
  plugins: [surgi()],
  ...workspaceSources,
  esbuild: { jsx: 'preserve' },
  test: {
    name: 'ui',
    environment: 'happy-dom',
    include: ['test/**/*.test.{ts,tsx}'],
    setupFiles: ['test/setup.ts'],
  },
});
