import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['packages/compiler', 'packages/surgijs', 'packages/store', 'packages/ui'],
  },
});
