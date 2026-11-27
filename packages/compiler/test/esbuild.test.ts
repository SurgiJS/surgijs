import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import surgi, { type SurgiEsbuildPluginOptions } from '../src/esbuild.ts';

type Load = (args: { path: string; suffix?: string }) => Promise<{ contents: string; loader: 'ts' | 'js' } | undefined>;
type Resolve = (args: { path: string; resolveDir: string }) => { path: string; suffix: string };

function plugin(options?: SurgiEsbuildPluginOptions): { load: Load; resolve: Resolve } {
  let load!: Load;
  let resolve!: Resolve;
  surgi(options).setup({ onResolve: (_, cb) => (resolve = cb), onLoad: (_, cb) => (load = cb) });
  return { load, resolve };
}

const loader = (options?: SurgiEsbuildPluginOptions): Load => plugin(options).load;

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

  it('compiles ?ssr imports for the server', async () => {
    const { load, resolve } = plugin();
    const resolved = resolve({ path: './app.tsx?ssr', resolveDir: dir });
    expect(resolved).toEqual({ path: app, suffix: '?ssr' });
    const ssr = (await load(resolved))?.contents;
    expect(ssr).toContain('"<div></div>"');
    expect(ssr).not.toContain('_$template');
    expect((await load({ path: app }))?.contents).toContain('_$template');
  });
});
