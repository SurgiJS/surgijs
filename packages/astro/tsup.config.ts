import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    server: 'src/server.ts',
    client: 'src/client.ts',
    hydrate: 'src/hydrate.ts',
  },
  format: ['esm'],
  target: 'es2022',
  platform: 'node',
  splitting: true,
  dts: { compilerOptions: { ignoreDeprecations: '6.0' } },
  sourcemap: true,
  clean: true,
  external: [/^@surgijs\//, 'astro'],
});
