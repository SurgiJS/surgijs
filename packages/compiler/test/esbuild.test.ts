import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import surgi, { type SurgiEsbuildPluginOptions } from '../src/esbuild.ts';

type Load = (args: { path: string }) => Promise<{ contents: string; loader: 'ts' | 'js' } | undefined>;

function loader(options?: SurgiEsbuildPluginOptions): Load {
  let load!: Load;
  surgi(options).setup({ onLoad: (_, cb) => (load = cb) });
  return load;
}

describe('esbuild plugin', () => {
  const dir = mkdtempSync(join(tmpdir(), 'surgi-esbuild-'));
  const app = join(dir, 'app.tsx');
  const dep = join(dir, 'node_modules', 'lib', 'index.jsx');
  mkdirSync(join(dir, 'node_modules', 'lib'), { recursive: true });
  writeFileSync(app, 'export const el = <div />;');
  writeFileSync(dep, 'export const el = <div />;');

  it('compiles project files and leaves node_modules to esbuild', async () => {
    const load = loader();
    expect((await load({ path: app }))?.contents).toContain('_$template("<div></div>")');
    expect(await load({ path: dep })).toBeUndefined();
  });

  it('compiles what include selects', async () => {
    const load = loader({ include: (path) => path.includes('lib') });
    expect((await load({ path: dep }))?.loader).toBe('js');
    expect(await load({ path: app })).toBeUndefined();
  });
});
