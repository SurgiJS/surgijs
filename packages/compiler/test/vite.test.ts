import { describe, expect, it } from 'vitest';
import surgi from '../src/vite.ts';

describe('vite plugin config', () => {
  it('uses esbuild.jsx on Vite 7 and older', () => {
    expect(surgi().config.call({ meta: {} })).toEqual({ esbuild: { jsx: 'preserve' } });
    expect(surgi().config.call(undefined)).toEqual({ esbuild: { jsx: 'preserve' } });
  });

  it('uses oxc.jsx on Vite 8 (Rolldown)', () => {
    expect(surgi().config.call({ meta: { rolldownVersion: '1.0.0' } })).toEqual({ oxc: { jsx: 'preserve' } });
  });

  it('loads React DevTools while Vite is serving and skips a production build', () => {
    const dev = surgi();
    dev.configResolved({ command: 'serve' });
    expect(dev.transformIndexHtml()?.[0]?.children).toContain('import { installDevtools } from "@surgijs/core/devtools"');

    const named = surgi({ moduleName: 'my-runtime' });
    named.configResolved({ command: 'serve' });
    expect(named.transformIndexHtml()?.[0]?.children).toContain('my-runtime/devtools');

    const build = surgi();
    build.configResolved({ command: 'build' });
    expect(build.transformIndexHtml()).toBeUndefined();
  });
});
