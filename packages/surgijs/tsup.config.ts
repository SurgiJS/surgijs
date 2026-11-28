import { defineConfig, type Options } from 'tsup';

const entry = {
  index: 'src/index.ts',
  internal: 'src/internal.ts',
  'jsx-runtime': 'src/jsx-runtime.ts',
  'jsx-dev-runtime': 'src/jsx-dev-runtime.ts',
  hydrate: 'src/hydrate.ts',
  server: 'src/server.ts',
  devtools: 'src/devtools.ts',
};

const common: Options = {
  entry,
  format: ['esm'],
  target: 'es2022',
  platform: 'browser',
  splitting: true,
  treeshake: true,
  sourcemap: true,
};

/**
 * Two builds, chosen by the `development` export condition as in Lit: dist/ is the
 * production build (no warnings, no reference to `process`), so it runs unbundled from a CDN,
 * an import map, Node or Deno; dist/development/ keeps the warnings and is what Vite and
 * webpack pick in development.
 */
export default defineConfig([
  {
    ...common,
    outDir: 'dist',
    dts: { compilerOptions: { ignoreDeprecations: '6.0' } },
    define: { 'process.env.NODE_ENV': '"production"' },
  },
  {
    ...common,
    outDir: 'dist/development',
    define: { 'process.env.NODE_ENV': '"development"' },
  },
]);
