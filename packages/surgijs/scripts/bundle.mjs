import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
import { build } from 'esbuild';

const src = fileURLToPath(new URL('../src/', import.meta.url));
const root = fileURLToPath(new URL('../../../', import.meta.url));

/** esbuild plugin: `@surgijs/core` from workspace sources, `.tsx` through the compiler sources. */
export function workspace() {
  return {
    name: 'surgijs-workspace',
    setup(b) {
      b.onResolve({ filter: /^@surgijs\/core$/ }, () => ({ path: `${src}index.ts` }));
      b.onResolve({ filter: /^@surgijs\/core\/(.+)$/ }, (args) => ({ path: `${src}${args.path.slice('@surgijs/core/'.length)}.ts` }));
      b.onLoad({ filter: /\.[jt]sx$/ }, async (args) => {
        const { compile } = await import(`${root}packages/compiler/src/index.ts`);
        const source = await readFile(args.path, 'utf8');
        const { code } = compile(source, { filename: args.path, sourceMap: false });
        return { contents: code, loader: args.path.endsWith('.tsx') ? 'ts' : 'js', resolveDir: args.path.replace(/[\\/][^\\/]*$/, '') };
      });
    },
  };
}

/**
 * Bundles `contents` (an ES module) minified for the browser and reports its sizes.
 * Paths in `contents` resolve from the repository root.
 */
export async function bundle(contents) {
  const result = await build({
    stdin: { contents, resolveDir: root, loader: 'ts', sourcefile: 'entry.ts' },
    bundle: true,
    write: false,
    minify: true,
    format: 'esm',
    target: 'es2022',
    platform: 'browser',
    treeShaking: true,
    legalComments: 'none',
    plugins: [workspace()],
    logLevel: 'silent',
  });
  const code = result.outputFiles[0].text;
  const buf = Buffer.from(code);
  return {
    code,
    min: buf.length,
    gzip: gzipSync(buf, { level: 9 }).length,
    brotli: brotliCompressSync(buf, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length,
  };
}

/** Size budgets, min+gzip bytes. */
export const CASES = [
  { name: 'full runtime (export *)', entry: "export * from '@surgijs/core';", limit: 6215 },
  {
    name: 'useState only',
    entry: "import { useState } from '@surgijs/core'; const [n, setN] = useState(0); setN(1); console.log(n());",
    limit: 720,
  },
  { name: 'counter app (compiled)', entry: "export * from './apps/playground/src/counter.tsx';", limit: 3794 },
  { name: 'dropdown app (compiled)', entry: "export * from './apps/playground/src/dropdown.tsx';", limit: 5601 },
];
