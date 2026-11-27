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
});

describe('vite plugin HMR', () => {
  const plugin = surgi();
  const source = "import { defineComponent } from '@surgijs/core';\nexport const A = defineComponent('x-a', () => <b>a</b>);\n";
  const accept = 'if (import.meta.hot) import.meta.hot.accept();';

  it('accepts hot updates in compiled modules that define components', () => {
    const out = plugin.transform(source, '/src/a.tsx');
    expect(out?.code).toContain(accept);
  });

  it('accepts hot updates in plain TypeScript modules that define components', () => {
    const out = plugin.transform("export const B = defineComponent('x-b', () => null);", '/src/b.ts');
    expect(out?.code).toContain(accept);
  });

  it('accepts aliased imports and namespace calls', () => {
    const alias = "import { defineComponent as define } from '@surgijs/core';\ndefine('x-c', () => null);";
    const ns = "import * as core from '@surgijs/core';\ncore.defineComponent('x-d', () => null);";
    expect(plugin.transform(alias, '/src/c.ts')?.code).toContain(accept);
    expect(plugin.transform(ns, '/src/d.ts')?.code).toContain(accept);
    expect(plugin.transform("import { define } from './x';\ndefine('x-e');", '/src/e.ts')).toBeNull();
  });

  it('leaves modules without a component definition alone', () => {
    expect(plugin.transform('export const n = 1;', '/src/n.ts')).toBeNull();
    expect(plugin.transform('export function defineComponent<P>(tag: string) {}', '/src/component.ts')).toBeNull();
    expect(plugin.transform("// defineComponent('x', f)\nexport const s = 'defineComponent(';", '/src/labels.ts')).toBeNull();
  });

  it('skips SSR output and dependencies', () => {
    expect(plugin.transform(source, '/src/a.tsx?ssr')?.code ?? '').not.toContain(accept);
    expect(plugin.transform(source, '/node_modules/lib/a.tsx')).toBeNull();
    const plain = "export const B = defineComponent('x-b', () => null);";
    expect(plugin.transform(plain, '/src/b.ts', { ssr: true })).toBeNull();
    expect(plugin.transform(plain, '/src/b.ts', { ssr: false })?.code).toContain(accept);
  });
});
