import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const REPO = process.env.SURGIJS_REPO ?? fileURLToPath(new URL('../../../', import.meta.url));
const runtime = `${REPO}/packages/surgijs/src/`;

await build({
  entryPoints: ['src/main.tsx'],
  bundle: true,
  outfile: 'dist/main.js',
  format: 'iife',
  target: 'es2022',
  platform: 'browser',
  minify: true,
  legalComments: 'none',
  conditions: ['production', 'browser'],
  define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [
    {
      name: 'surgijs',
      setup(b) {
        b.onResolve({ filter: /^@surgijs\/core$/ }, () => ({ path: `${runtime}index.ts` }));
        b.onResolve({ filter: /^@surgijs\/core\/(.+)$/ }, (args) => ({
          path: `${runtime}${args.path.slice('@surgijs/core/'.length)}.ts`,
        }));
        b.onLoad({ filter: /\.tsx$/ }, async (args) => {
          const { compile } = await import(`${REPO}/packages/compiler/src/index.ts`);
          const { code } = compile(await readFile(args.path, 'utf8'), { filename: args.path, sourceMap: false });
          return { contents: code, loader: 'ts' };
        });
      },
    },
  ],
  logLevel: 'info',
});
