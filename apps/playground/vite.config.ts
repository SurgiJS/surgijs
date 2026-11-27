import { defineConfig } from 'vite';
import surgi from '../../packages/compiler/src/vite.ts';
import { workspaceSources } from '../../tools/vite-workspace.ts';

export default defineConfig({
  plugins: [surgi()],
  ...workspaceSources,
});
