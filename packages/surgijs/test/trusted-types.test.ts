import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  delete (globalThis as any)[Symbol.for('surgijs.trustedTypes')];
  vi.resetModules();
});

const load = () => import('../src/dom');

describe('Trusted Types', () => {
  it('routes template markup through a surgijs policy', async () => {
    const createHTML = vi.fn((h: string) => h);
    const createPolicy = vi.fn((_name: string) => ({ createHTML }));
    vi.stubGlobal('trustedTypes', { createPolicy });
    const { template } = await load();
    const el = template('<p>hi</p>')() as HTMLElement;
    template('<b>again</b>')();
    expect(el.outerHTML).toBe('<p>hi</p>');
    expect(createPolicy).toHaveBeenCalledTimes(1);
    expect(createPolicy.mock.calls[0]?.[0]).toBe('surgijs');
    expect(createHTML).toHaveBeenCalledTimes(2);
  });

  it('wraps svg roots before sanitising', async () => {
    const createHTML = vi.fn((h: string) => h);
    vi.stubGlobal('trustedTypes', { createPolicy: () => ({ createHTML }) });
    const { parseTemplate } = await load();
    const node = parseTemplate('<circle/>', 2) as Element;
    expect(node.localName).toBe('circle');
    expect(createHTML).toHaveBeenCalledWith('<svg><circle/></svg>');
  });

  it('falls back to plain strings when the CSP refuses the policy', async () => {
    vi.stubGlobal('trustedTypes', {
      createPolicy: () => {
        throw new TypeError('Policy "surgijs" disallowed');
      },
    });
    const { parseTemplate } = await load();
    expect((parseTemplate('<i>x</i>', 0) as Element).outerHTML).toBe('<i>x</i>');
  });

  it('shares one policy between runtime copies', async () => {
    const createHTML = vi.fn((h: string) => h);
    const createPolicy = vi.fn((_name: string) => ({ createHTML }));
    vi.stubGlobal('trustedTypes', { createPolicy });
    (await load()).parseTemplate('<p/>', 0);
    vi.resetModules();
    (await load()).parseTemplate('<p/>', 0);
    expect(createPolicy).toHaveBeenCalledTimes(1);
    expect(createHTML).toHaveBeenCalledTimes(2);
  });
});
