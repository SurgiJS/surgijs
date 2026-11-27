import { describe, expect, it } from 'vitest';
import { createStore, persist } from '@surgijs/store';

const memory = (initial: Record<string, string> = {}) => {
  const data = { ...initial };
  return { data, getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => void (data[k] = v) };
};

describe('persist', () => {
  it('restores listed keys and saves changes', () => {
    const storage = memory({ app: JSON.stringify({ cityId: 7, other: 1 }) });
    const store = createStore({ cityId: 1, theme: 'light', other: 0 });
    const stop = persist(store, { name: 'app', keys: ['cityId', 'theme'], storage });
    expect(store.get()).toEqual({ cityId: 7, theme: 'light', other: 0 });

    store.set('theme', 'dark');
    expect(JSON.parse(storage.data.app!)).toEqual({ cityId: 7, theme: 'dark' });
    stop();
    store.set('theme', 'light');
    expect(JSON.parse(storage.data.app!).theme).toBe('dark');
  });

  it('ignores corrupt data and missing storage', () => {
    const store = createStore({ a: 1 });
    persist(store, { name: 'x', keys: ['a'], storage: memory({ x: '{nope' }) });
    expect(store.get((s) => s.a)).toBe(1);
    expect(persist(store, { name: 'x', keys: ['a'] })).toBeTypeOf('function');
  });
});
