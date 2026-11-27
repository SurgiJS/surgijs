import { copyFileSync } from 'node:fs';
import { defineConfig } from 'tsup';
import type surgiPlugin from '@surgijs/compiler/esbuild';

// Imported through a variable so tsup's config bundler leaves it external: the plugin then
// resolves its own dependencies (oxc-parser) from packages/compiler.
const PLUGIN = '@surgijs/compiler/esbuild';

export default defineConfig(async () => {
  const { default: surgi } = (await import(PLUGIN)) as { default: typeof surgiPlugin };
  return {
    entry: {
      index: 'src/index.ts',
      button: 'src/button/index.ts',
      server: 'src/server.ts',
    },
    format: ['esm'],
    target: 'es2022',
    platform: 'browser',
    splitting: true,
    treeshake: true,
    dts: { compilerOptions: { ignoreDeprecations: '6.0', paths: {} } },
    sourcemap: true,
    clean: true,
    external: [/^@surgijs\/core/],
    // Each `.tsx` view compiles for the DOM; `?ssr` imports in src/server.ts compile for the server.
    esbuildPlugins: [surgi()],
    onSuccess: async () => copyFileSync('src/themes.css', 'dist/themes.css'),
  };
});
