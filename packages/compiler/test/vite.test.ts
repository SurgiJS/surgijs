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

  it('leaves modules without a component definition alone', () => {
    expect(plugin.transform('export const n = 1;', '/src/n.ts')).toBeNull();
    expect(plugin.transform('export function defineComponent<P>(tag: string) {}', '/src/component.ts')).toBeNull();
    expect(plugin.transform("// defineComponent('x', f)\nexport const s = 'defineComponent(';", '/src/labels.ts')).toBeNull();
  });

  it('skips SSR output and dependencies', () => {
    expect(plugin.transform(source, '/src/a.tsx?ssr')?.code ?? '').not.toContain(accept);
    expect(plugin.transform(source, '/node_modules/lib/a.tsx')).toBeNull();
  });
});
