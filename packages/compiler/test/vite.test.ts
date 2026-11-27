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
    expect(dev.transformIndexHtml.order).toBe('pre');
    expect(dev.transformIndexHtml.handler()?.[0]?.children).toContain('import { installDevtools } from "@surgijs/core/devtools"');

    const custom = surgi({ moduleName: 'my-runtime' });
    custom.configResolved({ command: 'serve' });
    expect(custom.transformIndexHtml.handler()).toBeUndefined();

    const named = surgi({ moduleName: 'my-runtime', devtools: true });
    named.configResolved({ command: 'serve' });
    expect(named.transformIndexHtml.handler()?.[0]?.children).toContain('my-runtime/devtools');

    const off = surgi({ devtools: false });
    off.configResolved({ command: 'serve' });
    expect(off.transformIndexHtml.handler()).toBeUndefined();

    const build = surgi();
    build.configResolved({ command: 'build' });
    expect(build.transformIndexHtml.handler()).toBeUndefined();
  });

  it('forwards compiler warnings to Vite', () => {
    const warnings: unknown[] = [];
    const ctx = { warn: (message: string, position: unknown) => warnings.push([message, position]) };
    surgi().transform.call(ctx, 'const [a] = useState(1);\nconst o = { a }; <i />;', 'app.tsx');
    expect(warnings).toEqual([[expect.stringContaining('a: () => a()'), { line: 2, column: 12 }]]);
  });
});
