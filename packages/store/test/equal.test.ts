import { describe, expect, it } from 'vitest';
import { deepEqual } from '@surgijs/store';

describe('deepEqual', () => {
  it('compares primitives and objects structurally', () => {
    expect(deepEqual(1, 1)).toBe(true);
    expect(deepEqual(NaN, NaN)).toBe(true);
    expect(deepEqual({ a: 1, b: [2, 3] }, { a: 1, b: [2, 3] })).toBe(true);
    expect(deepEqual({ a: 1 }, { a: 2 })).toBe(false);
    expect(deepEqual([1], [1, 2])).toBe(false);
  });
});
