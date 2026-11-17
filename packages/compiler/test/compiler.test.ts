import { describe, expect, it } from 'vitest';
import * as compiler from '../src/index.ts';

describe('compiler', () => {
  it('loads', () => {
    expect(compiler).toBeTypeOf('object');
  });
});
