import { describe, expect, it } from 'vitest';
import * as runtime from 'surgijs';

describe('runtime', () => {
  it('loads', () => {
    expect(runtime).toBeTypeOf('object');
  });
});
