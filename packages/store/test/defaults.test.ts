import { describe, expect, it, vi } from 'vitest';
import { createRemote, createStore, remote } from '@surgijs/store';

describe('createStore defaults reach remote()', () => {
  it('uses createStore retry when remote() omits it', async () => {
    let loads = 0;
    const store = createStore(
      {
        users: remote({
          deps: () => '/users',
          fetch: async () => {
            loads++;
            throw new Error('boom');
          },
        }),
      },
      { retry: false },
    );
    store.subscribe((s) => s.users, () => {});
    await vi.waitFor(() => expect(store.status('users').isError).toBe(true));
    expect(loads).toBe(1);
  });

  it('lets remote() override createStore retry and uses createStore retryDelay', async () => {
    let loads = 0;
    const store = createStore(
      {
        users: remote({
          deps: () => '/users',
          retry: 1,
          fetch: async () => {
            loads++;
            throw new Error('boom');
          },
        }),
      },
      { retry: false, retryDelay: 0 },
    );
    store.subscribe((s) => s.users, () => {});
    await vi.waitFor(() => expect(store.status('users').isError).toBe(true));
    expect(loads).toBe(2);
  });

  it('uses createStore staleTime when remote() omits it', async () => {
    const store = createStore(
      { users: remote({ deps: () => '/users', fetch: () => 1 }) },
      { staleTime: Infinity, retry: false },
    );
    store.subscribe((s) => s.users, () => {});
    await vi.waitFor(() => expect(store.status('users').isSuccess).toBe(true));
    expect(store.status('users').staleTime).toBe(Infinity);
    expect(store.status('users').isStale).toBe(false);
  });
});

describe('deps binding', () => {
  const setup = (keepPreviousData?: boolean) => {
    const gates = new Map<number, (v: string) => void>();
    const store = createStore({
      cityId: 1,
      weather: remote({
        deps: (get) => get.cityId,
        retry: false,
        keepPreviousData,
        fetch: (_get, { deps }) => new Promise<string>((resolve) => gates.set(deps as number, resolve)),
      }),
    });
    return { store, gates };
  };

  it('drops data of the previous deps while new deps load', async () => {
    const { store, gates } = setup();
    store.subscribe((s) => s.weather, () => {});
    gates.get(1)!('rain');
    await vi.waitFor(() => expect(store.get((s) => s.weather)).toBe('rain'));
    expect(store.status('weather').dataDeps).toBe(1);

    store.set('cityId', 2);
    expect(store.get((s) => s.weather)).toBeUndefined();
    expect(store.status('weather')).toMatchObject({ status: 'pending', isPreviousData: false, deps: 2 });

    gates.get(2)!('sun');
    await vi.waitFor(() => expect(store.get((s) => s.weather)).toBe('sun'));
    expect(store.status('weather')).toMatchObject({ dataDeps: 2, deps: 2, isPreviousData: false });
  });

  it('keepPreviousData keeps data and flags it', async () => {
    const { store, gates } = setup(true);
    store.subscribe((s) => s.weather, () => {});
    gates.get(1)!('rain');
    await vi.waitFor(() => expect(store.get((s) => s.weather)).toBe('rain'));

    store.set('cityId', 2);
    expect(store.get((s) => s.weather)).toBe('rain');
    expect(store.status('weather')).toMatchObject({ dataDeps: 1, deps: 2, isPreviousData: true });

    gates.get(2)!('sun');
    await vi.waitFor(() => expect(store.status('weather').isPreviousData).toBe(false));
    expect(store.get((s) => s.weather)).toBe('sun');
  });

  it('keeps data on refetch with the same deps', async () => {
    const { store, gates } = setup();
    store.subscribe((s) => s.weather, () => {});
    gates.get(1)!('rain');
    await vi.waitFor(() => expect(store.get((s) => s.weather)).toBe('rain'));
    void store.refetch('weather');
    expect(store.get((s) => s.weather)).toBe('rain');
  });
});

describe('debounce', () => {
  it('fetches once after deps settle and never delays the first load', async () => {
    vi.useFakeTimers();
    try {
      const seen: string[] = [];
      const store = createStore({
        q: 'a',
        results: remote({
          deps: (get) => get.q,
          debounce: 100,
          retry: false,
          fetch: (_get, { deps }) => {
            seen.push(deps as string);
            return deps as string;
          },
        }),
      });
      store.subscribe((s) => s.results, () => {});
      expect(seen).toEqual(['a']);
      store.set('q', 'ab');
      store.set('q', 'abc');
      vi.advanceTimersByTime(99);
      expect(seen).toEqual(['a']);
      expect(store.get((s) => s.results)).toBeUndefined();
      vi.advanceTimersByTime(1);
      expect(seen).toEqual(['a', 'abc']);
      await vi.advanceTimersByTimeAsync(0);
      expect(store.get((s) => s.results)).toBe('abc');
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancels the pending fetch when the last subscriber leaves', () => {
    vi.useFakeTimers();
    try {
      let loads = 0;
      const store = createStore({
        q: 'a',
        results: remote({ deps: (get) => get.q, debounce: 50, retry: false, fetch: () => ++loads }),
      });
      const stop = store.subscribe((s) => s.results, () => {});
      store.set('q', 'b');
      stop();
      vi.advanceTimersByTime(100);
      expect(loads).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('typed remote', () => {
  it('types get and ctx.deps', async () => {
    type State = { cityId: number; label: string };
    const typed = createRemote<State>();
    const store = createStore({
      cityId: 1,
      label: 'x',
      weather: typed({
        deps: (get) => [get.cityId, get('label')] as const,
        fetch: async (get, { deps }) => {
          const [id, label] = deps;
          const n: number = id + get.cityId;
          const s: string = label + get('label') + get((st) => st.label);
          return `${n}${s}`;
        },
        retry: false,
      }),
    });
    store.subscribe((s) => s.weather, () => {});
    await vi.waitFor(() => expect(store.get((s) => s.weather)).toBe('2xxx'));

    const tuple = typed({
      deps: (get) => [get.cityId, get.label],
      fetch: (_get, { deps: [id, label] }) => `${id satisfies number}${label satisfies string}`,
    });
    expect(tuple).toBeDefined();

    const plain = remote({
      deps: () => ({ id: 1 }),
      fetch: async (_get, { deps }) => deps.id,
    });
    expect(plain).toBeDefined();
  });
});
