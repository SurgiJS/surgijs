import { defineProject } from 'vitest/config';
import { workspaceSources } from '../../tools/vite-workspace.ts';
import surgi from '../compiler/src/vite.ts';

export default defineProject({
  plugins: [surgi({ generate: 'auto' })],
  ...workspaceSources,
  esbuild: { jsx: 'preserve' },
  test: {
    name: 'astro',
    environment: 'node',
    include: ['test/**/*.test.{ts,tsx}'],
  },
});
