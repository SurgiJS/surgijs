import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    vite: 'src/vite.ts',
    esbuild: 'src/esbuild.ts',
  },
  format: ['esm'],
  target: 'node18',
  platform: 'node',
  splitting: true,
  dts: { compilerOptions: { ignoreDeprecations: '6.0' } },
  sourcemap: true,
  clean: true,
  external: ['oxc-parser'],
});
