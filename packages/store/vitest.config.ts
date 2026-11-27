import { defineProject } from 'vitest/config';
import { workspaceSources } from '../../tools/vite-workspace.ts';

export default defineProject({
  ...workspaceSources,
  test: {
    name: 'store',
    environment: 'node',
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
  },
});
