import { describe, expect, it, vi } from 'vitest';
import {
  batch,
  bind,
  createEffect,
  createMemo,
  createRenderEffect,
  createRoot,
  createSignal,
  deferMount,
  flush,
  onCleanup,
  untrack,
  useEffect,
} from 'surgijs';

describe('signals', () => {
  it('reads and writes with Object.is', () => {
    const [n, setN] = createSignal(1);
    expect(n()).toBe(1);
    expect(setN(2)).toBe(2);
    expect(n()).toBe(2);
    setN((v) => v + 1);
    expect(n()).toBe(3);
  });

  it('batches writes into one microtask', async () => {
    const [n, setN] = createSignal(0);
    const seen: number[] = [];
    createRoot(() => createRenderEffect(() => seen.push(n())));
    setN(1);
    setN(2);
    expect(seen).toEqual([0]);
    await Promise.resolve();
    expect(seen).toEqual([0, 2]);
  });

  it('skips equal writes', () => {
    const [n, setN] = createSignal(NaN);
    let runs = 0;
    createRoot(() => createRenderEffect(() => (n(), runs++)));
    setN(NaN);
    flush();
    expect(runs).toBe(1);
  });
});

describe('computations', () => {
  it('drops dependencies that a rerun no longer reads', () => {
    const [cond, setCond] = createSignal(true);
    const [a, setA] = createSignal('a');
    const [b, setB] = createSignal('b');
    const seen: string[] = [];
    createRoot(() => createRenderEffect(() => seen.push(cond() ? a() : b())));
    setCond(false);
    flush();
    setA('A');
    flush();
    expect(seen).toEqual(['a', 'b']);
    setB('B');
    flush();
    expect(seen).toEqual(['a', 'b', 'B']);
  });

  it('memos recompute once and notify only on change', () => {
    const [n, setN] = createSignal(1);
    let calls = 0;
    const parity = createMemo(() => (calls++, n() % 2));
    const seen: number[] = [];
    createRoot(() => createRenderEffect(() => seen.push(parity())));
    setN(3);
    flush();
    expect(calls).toBe(2);
    expect(seen).toEqual([1]);
    setN(4);
    flush();
    expect(seen).toEqual([1, 0]);
  });

  it('reads fresh memo values synchronously after a write', () => {
    const [n, setN] = createSignal(1);
    const double = createMemo(() => n() * 2);
    setN(5);
    expect(double()).toBe(10);
  });

  it('runs effects without glitches across memos', () => {
    const [n, setN] = createSignal(1);
    const double = createMemo(() => n() * 2);
    const seen: string[] = [];
    createRoot(() => createEffect(() => seen.push(`${n()}:${double()}`)));
    flush();
    setN(2);
    flush();
    expect(seen).toEqual(['1:2', '2:4']);
  });

  it('passes the previous value to render effects', () => {
    const [n, setN] = createSignal(1);
    const prev: (number | undefined)[] = [];
    createRoot(() =>
      createRenderEffect((p: number | undefined) => {
        prev.push(p);
        return n();
      }),
    );
    setN(2);
    flush();
    expect(prev).toEqual([undefined, 1]);
  });

  it('disposes owned computations and cleanups', () => {
    const [n, setN] = createSignal(0);
    const log: string[] = [];
    const dispose = createRoot((d) => {
      createRenderEffect(() => {
        n();
        onCleanup(() => log.push('cleanup'));
      });
      return d;
    });
    setN(1);
    flush();
    expect(log).toEqual(['cleanup']);
    dispose();
    expect(log).toEqual(['cleanup', 'cleanup']);
    setN(2);
    flush();
    expect(log).toEqual(['cleanup', 'cleanup']);
  });

  it('untrack and batch', () => {
    const [a, setA] = createSignal(1);
    const [b, setB] = createSignal(1);
    let runs = 0;
    createRoot(() => createRenderEffect(() => (a(), untrack(b), runs++)));
    setB(2);
    flush();
    expect(runs).toBe(1);
    batch(() => {
      setA(2);
      setA(3);
    });
    expect(runs).toBe(2);
  });

  it('deferMount runs effects after the body', () => {
    const log: string[] = [];
    createRoot(() =>
      deferMount(() => {
        createEffect(() => log.push('effect'));
        log.push('body');
      }),
    );
    expect(log).toEqual(['body', 'effect']);
  });

  it('useEffect tracks deps only and runs cleanup', () => {
    const [a, setA] = createSignal(0);
    const [b, setB] = createSignal(0);
    const log: string[] = [];
    createRoot(() =>
      useEffect(
        () => {
          log.push(`run ${a()} ${b()}`);
          return () => log.push('cleanup');
        },
        () => a(),
      ),
    );
    flush();
    setB(1);
    flush();
    setA(1);
    flush();
    expect(log).toEqual(['run 0 0', 'cleanup', 'run 1 1']);
  });
});

describe('bind', () => {
  it('keeps the remaining observers when one binding disposes', () => {
    const [n, setN] = createSignal(1);
    const a = { v: 0 };
    const b = { v: 0 };
    const c = { v: 0 };
    const disposeA = createRoot((d) => {
      bind(a, n, (el, v: number) => (el.v = v));
      return d;
    });
    const disposeB = createRoot((d) => {
      bind(b, n, (el, v: number) => (el.v = v));
      return d;
    });
    createRoot(() => bind(c, n, (el, v: number) => (el.v = v)));
    disposeA();
    setN(2);
    flush();
    expect([a.v, b.v, c.v]).toEqual([1, 2, 2]);
    disposeB();
    setN(3);
    flush();
    expect([a.v, b.v, c.v]).toEqual([1, 2, 3]);
  });

  it('disposes every binding of an owner', () => {
    const [n, setN] = createSignal(1);
    const nodes = [{ v: 0 }, { v: 0 }, { v: 0 }];
    const dispose = createRoot((d) => {
      for (const node of nodes) bind(node, n, (el, v: number) => (el.v = v));
      return d;
    });
    dispose();
    setN(2);
    flush();
    expect(nodes.map((x) => x.v)).toEqual([1, 1, 1]);
  });

  it('applies on change through a direct read', () => {
    const [n, setN] = createSignal(1);
    const node = { v: 0 };
    let applied = 0;
    const dispose = createRoot((d) => {
      bind(node, n, (el, v) => ((el.v = v), applied++));
      return d;
    });
    expect(node.v).toBe(1);
    setN(2);
    flush();
    expect(node.v).toBe(2);
    dispose();
    setN(3);
    flush();
    expect(node.v).toBe(2);
    expect(applied).toBe(2);
  });

  it('passes a getter to a hoisted reader', () => {
    const [a, setA] = createSignal(1);
    const node = { v: 0 };
    const read = (p0: () => number) => p0() * 2;
    createRoot(() => bind(node, read, (el, v: number) => (el.v = v), a));
    expect(node.v).toBe(2);
    setA(10);
    flush();
    expect(node.v).toBe(20);
  });

  it('collects several sources in one binding', () => {
    const [a, setA] = createSignal(1);
    const [b, setB] = createSignal(2);
    const node = { v: 0 };
    createRoot(() => bind(node, () => a() + b() + a(), (el, v: number) => (el.v = v)));
    expect(node.v).toBe(4);
    setA(10);
    setB(20);
    flush();
    expect(node.v).toBe(40);
  });

  it('reads memos as sources', () => {
    const [n, setN] = createSignal(1);
    const double = createMemo(() => n() * 2);
    const node = { v: 0 };
    createRoot(() => bind(node, double, (el, v: number) => (el.v = v)));
    setN(4);
    flush();
    expect(node.v).toBe(8);
  });

  it('disposes many bindings of one source with at most one search of its observer list', () => {
    const [sel, setSel] = createSignal(0);
    const [label] = createSignal('x');
    const disposers: (() => void)[] = [];
    for (let i = 0; i < 500; i++)
      createRoot((d) => {
        disposers.push(d);
        bind({}, () => (sel() === i ? label() : ''), () => {});
      });
    const search = vi.spyOn(Array.prototype, 'lastIndexOf');
    try {
      for (const d of disposers) d();
      expect(search.mock.calls.length).toBeLessThanOrEqual(1);
    } finally {
      search.mockRestore();
    }
    setSel(1);
    flush();
  });

  it('keeps exactly the surviving bindings after disposal in any order', () => {
    const [n, setN] = createSignal(0);
    const nodes = Array.from({ length: 200 }, () => ({ v: 0 }));
    const disposers = nodes.map((node) => createRoot((d) => (bind(node, n, (el, v: number) => (el.v = v)), d)));
    const gone = new Set<number>();
    for (let k = 0; k < 120; k++) {
      const i = (k * 37 + 11) % nodes.length;
      if (!gone.has(i)) disposers[i]!(), gone.add(i);
    }
    setN(7);
    flush();
    nodes.forEach((node, i) => expect(node.v).toBe(gone.has(i) ? 0 : 7));
  });

  it('follows sources that a conditional read switches to', () => {
    const [cond, setCond] = createSignal(true);
    const [a, setA] = createSignal('a1');
    const [b, setB] = createSignal('b1');
    const node = { v: '' };
    createRoot(() => bind(node, () => (cond() ? a() : b()), (el, v: string) => (el.v = v)));
    setCond(false);
    flush();
    expect(node.v).toBe('b1');
    setB('b2');
    flush();
    expect(node.v).toBe('b2');
    setA('a2');
    flush();
    expect(node.v).toBe('b2');
    setCond(true);
    flush();
    expect(node.v).toBe('a2');
  });
});
