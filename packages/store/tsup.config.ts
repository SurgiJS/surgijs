import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    react: 'src/react.ts',
    core: 'src/core.ts',
  },
  // http helpers ship in the main entry
  format: ['esm'],
  target: 'es2022',
  platform: 'neutral',
  splitting: true,
  treeshake: true,
  dts: { compilerOptions: { ignoreDeprecations: '6.0' } },
  sourcemap: true,
  clean: true,
  external: ['react', '@surgijs/core'],
});
