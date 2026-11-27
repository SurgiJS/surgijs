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
