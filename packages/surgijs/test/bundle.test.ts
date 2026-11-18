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

  it.each(CASES)('$name fits its budget', async ({ entry, limit }) => {
    expect((await bundle(entry)).gzip).toBeLessThanOrEqual(limit);
  });
});
