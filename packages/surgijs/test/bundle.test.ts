// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bundle, CASES } from '../scripts/bundle.mjs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const entry = (name: string): string => CASES.find((c) => c.name.startsWith(name))!.entry;

describe('bundle', () => {
  it('ships with zero dependencies and without side effects', () => {
    expect(pkg.dependencies ?? {}).toEqual({});
    expect(pkg.sideEffects).toBe(false);
  });

  it('full runtime is self-contained and client-only', async () => {
    const { code } = await bundle(entry('full runtime'));
    expect(code).not.toMatch(/\bimport\b/);
    expect(code).not.toContain('shadowrootmode');
  });

  it('keeps React DevTools out of the production counter', async () => {
    const { code } = await bundle(entry('counter'));
    expect(code).not.toContain('__REACT_DEVTOOLS_GLOBAL_HOOK__');
    expect(code).not.toContain('installDevtools');
  });

  it('strips dev warnings from production bundles', async () => {
    for (const name of ['full runtime', 'counter', 'dropdown']) {
      const { code } = await bundle(entry(name));
      expect(code).not.toContain('[surgijs]');
      expect(code).not.toContain('console.warn');
    }
  });

  it('compiled counter detects events without startsWith', async () => {
    const { code } = await bundle(entry('counter'));
    expect(code).not.toContain('startsWith("on")');
  });

  it('useState alone tree-shakes the DOM and component layers', async () => {
    const { code } = await bundle(entry('useState'));
    for (const word of ['customElements', 'attachShadow', 'observedAttributes', 'createElement', 'addEventListener']) {
      expect(code).not.toContain(word);
    }
  });

  it('useReducer alone tree-shakes the DOM and component layers', async () => {
    const { code } = await bundle(
      "import { useReducer } from '@surgijs/core'; const [n, dispatch] = useReducer((s: number) => s + 1, 0); dispatch(); console.log(n());",
    );
    for (const word of ['customElements', 'attachShadow', 'observedAttributes', 'createElement', 'addEventListener']) {
      expect(code).not.toContain(word);
    }
  });

  it.each(CASES)('$name fits its budget', async ({ entry, limit }) => {
    expect((await bundle(entry)).gzip).toBeLessThanOrEqual(limit);
  });
});
