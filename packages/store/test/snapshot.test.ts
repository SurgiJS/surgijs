import { describe, expect, it } from 'vitest';
import { createSnapshot, getPath } from '../src/snapshot.ts';

describe('createSnapshot', () => {
  it('records nested paths from destructuring-style reads', () => {
    const paths: string[][] = [];
    const snap = createSnapshot(
      {
        userId: 7,
        profile: { user: { name: 'Ada' } },
      },
      paths,
    );

    const { userId, profile } = snap;
    const { user: details } = profile;
    expect(userId).toBe(7);
    expect(details).toEqual({ name: 'Ada' });
    expect(paths).toContainEqual(['userId']);
    expect(paths).toContainEqual(['profile']);
    expect(paths).toContainEqual(['profile', 'user']);
  });

  it('getPath walks nested keys', () => {
    expect(getPath({ a: { b: 1 } }, ['a', 'b'])).toBe(1);
    expect(getPath({ a: null }, ['a', 'b'])).toBeUndefined();
  });
});
