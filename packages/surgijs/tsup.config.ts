import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'jsx-runtime': 'src/jsx-runtime.ts',
    'jsx-dev-runtime': 'src/jsx-dev-runtime.ts',
    hydrate: 'src/hydrate.ts',
    server: 'src/server.ts',
    devtools: 'src/devtools.ts',
  },
  format: ['esm'],
  target: 'es2022',
  platform: 'browser',
  splitting: true,
  treeshake: true,
  dts: { compilerOptions: { ignoreDeprecations: '6.0' } },
  sourcemap: true,
  clean: true,
});
