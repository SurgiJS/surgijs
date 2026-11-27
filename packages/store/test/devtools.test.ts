import { afterEach, describe, expect, it } from 'vitest';
import { createStore, remote } from '@surgijs/store';

interface Conn {
  sent: unknown[][];
  emit(message: unknown): void;
}

const names: string[] = [];
const connections: Conn[] = [];

function install(): void {
  const enhancer = () => (next: unknown) => next;
  (globalThis as { __REDUX_DEVTOOLS_EXTENSION__?: unknown }).__REDUX_DEVTOOLS_EXTENSION__ = Object.assign(enhancer, {
    connect(options?: { name?: string }) {
      names.push(options?.name ?? '');
      const sent: unknown[][] = [];
      let listener = (_message: unknown) => {};
      const conn: Conn = {
        sent,
        emit(message) {
          listener(message);
        },
      };
      connections.push(conn);
      return {
        init(state: unknown) {
          sent.push(['init', state]);
        },
        send(action: unknown, state: unknown) {
          sent.push(['send', action, state]);
        },
        subscribe(fn: (message: unknown) => void) {
          listener = fn;
        },
      };
    },
  });
}

const jump = (state: unknown) => connections[0]!.emit({ type: 'DISPATCH', state: JSON.stringify(state) });

afterEach(() => {
  delete (globalThis as { __REDUX_DEVTOOLS_EXTENSION__?: unknown }).__REDUX_DEVTOOLS_EXTENSION__;
  names.length = 0;
  connections.length = 0;
});

describe('redux devtools', () => {
  it('names each store and sends sets and settled fetches', () => {
    install();
    const one = createStore({ n: 1 });
    const two = createStore({
      n: 1,
      item: remote({
        deps: (get) => get('n'),
        retry: 0,
        fetch: (get) => get('n'),
      }),
    });
    expect(names).toEqual(['SurgiJS', 'SurgiJS 2']);
    expect(connections[0]!.sent[0]).toEqual(['init', { n: 1 }]);

    two.subscribe(
      (s) => s.item,
      () => {},
    );
    expect(two.get()).toEqual({ n: 1, item: 1 });
    two.set('n', 2);
    expect(two.get()).toEqual({ n: 2, item: 2 });
    const sent = connections[1]!.sent;
    expect(sent.some((row) => JSON.stringify(row[1]) === JSON.stringify({ type: 'set', key: 'n' }))).toBe(true);
    expect(sent.some((row) => JSON.stringify(row[1]) === JSON.stringify({ type: 'fetch', key: 'item' }))).toBe(true);
    expect(one.get((s) => s.n)).toBe(1);
  });

  it('jumps to a state without refetching', () => {
    install();
    let fetches = 0;
    const store = createStore({
      n: 1,
      item: remote({
        deps: (get) => get('n'),
        retry: 0,
        fetch: () => {
          fetches += 1;
          return 'net';
        },
      }),
    });
    store.subscribe(
      (s) => s.item,
      () => {},
    );
    expect(fetches).toBe(1);
    jump({ n: 9, item: 'old' });
    expect(store.get()).toEqual({ n: 9, item: 'old' });
    expect(fetches).toBe(1);
  });

  it('does not fetch a remote that a jump makes a subscriber read', () => {
    install();
    let fetches = 0;
    const store = createStore({
      n: 0,
      item: remote({
        deps: () => 'k',
        retry: 0,
        fetch: () => {
          fetches += 1;
          return 'net';
        },
      }),
    });
    store.subscribe(
      (s) => (s.n === 1 ? s.item : null),
      () => {},
    );
    jump({ n: 1, item: 'old' });
    expect(store.get()).toEqual({ n: 1, item: 'old' });
    expect(fetches).toBe(0);
  });

  it('compares later deps against the restored state', () => {
    install();
    const store = createStore({
      n: 1,
      item: remote({ deps: (get) => get('n'), retry: 0, fetch: (get) => get('n') }),
    });
    store.subscribe(
      (s) => s.item,
      () => {},
    );
    jump({ n: 2, item: 2 });
    store.set('n', 1);
    expect(store.get()).toEqual({ n: 1, item: 1 });
  });

  it('drops a request in flight when a jump restores its remote', async () => {
    install();
    let resolve = (_v: string) => {};
    const store = createStore({
      item: remote({
        deps: () => 'k',
        retry: 0,
        fetch: () => new Promise<string>((r) => (resolve = r)),
      }),
    });
    store.subscribe(
      (s) => s.item,
      () => {},
    );
    expect(store.status('item').isFetching).toBe(true);
    jump({ item: 'old' });
    expect(store.status('item').isFetching).toBe(false);
    resolve('net');
    await Promise.resolve();
    await Promise.resolve();
    expect(store.get()).toEqual({ item: 'old' });
  });

  it('applies a set typed into the monitor and refetches', () => {
    install();
    let fetches = 0;
    const store = createStore({
      n: 1,
      item: remote({
        deps: (get) => get('n'),
        retry: 0,
        fetch: (get) => {
          fetches += 1;
          return get('n');
        },
      }),
    });
    store.subscribe(
      (s) => s.item,
      () => {},
    );
    expect(fetches).toBe(1);
    connections[0]!.emit({ type: 'ACTION', payload: JSON.stringify({ type: 'set', key: 'n', value: 4 }) });
    expect(store.get()).toEqual({ n: 4, item: 4 });
    expect(fetches).toBe(2);
  });

  it('leaves the store alone when the extension is missing', () => {
    const store = createStore({ n: 0 });
    store.set('n', 1);
    expect(store.get()).toEqual({ n: 1 });
    expect(names).toEqual([]);
  });
});
