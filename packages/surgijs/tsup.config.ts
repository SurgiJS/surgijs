import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    internal: 'src/internal.ts',
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
  define: { 'process.env.NODE_ENV': 'process.env.NODE_ENV' },
  sourcemap: true,
  clean: true,
});
