#!/usr/bin/env node
/**
 * Microbenchmarks: @surgijs/store vs zustand, jotai, valtio, nanostores, redux.
 * Run from repo root after `pnpm install`: `node packages/store/bench/run.mjs`
 */
import { performance } from 'node:perf_hooks';
import { createStore as createReduxStore } from 'redux';
import { atom, createStore as createJotaiStore } from 'jotai/vanilla';
import { atom as nanotom, computed as nanoComputed } from 'nanostores';
import { proxy, subscribe as valtioSubscribe, snapshot } from 'valtio/vanilla';
import { createStore as createZustandStore } from 'zustand/vanilla';
import { action, createStore, derived } from '../dist/index.js';

const ITER = 50_000;
const SUBS = 50;

function bench(name, setup) {
  const run = setup();
  for (let i = 0; i < 1000; i++) run();
  const t0 = performance.now();
  for (let i = 0; i < ITER; i++) run();
  const ms = performance.now() - t0;
  return { name, ms, ops: Math.round((ITER / ms) * 1000) };
}

function pad(s, n) {
  return String(s).padEnd(n);
}

/** Update one field; N subscribers watch that field; measure notify cost. */
function suiteUpdateWatched() {
  return [
    bench('surgijs/store', () => {
      const store = createStore({ count: 0, noise: 0 });
      const unsubs = [];
      for (let i = 0; i < SUBS; i++) unsubs.push(store.subscribe((s) => s.count, () => {}));
      let n = 0;
      return () => store.set('count', ++n);
    }),
    bench('zustand', () => {
      const store = createZustandStore(() => ({ count: 0, noise: 0 }));
      const unsubs = [];
      for (let i = 0; i < SUBS; i++) {
        unsubs.push(store.subscribe((s) => s.count, () => {}, { equalityFn: Object.is }));
      }
      let n = 0;
      return () => store.setState({ count: ++n });
    }),
    bench('jotai', () => {
      const countAtom = atom(0);
      const noiseAtom = atom(0);
      void noiseAtom;
      const jstore = createJotaiStore();
      const unsubs = [];
      for (let i = 0; i < SUBS; i++) unsubs.push(jstore.sub(countAtom, () => {}));
      let n = 0;
      return () => jstore.set(countAtom, ++n);
    }),
    bench('valtio', () => {
      const state = proxy({ count: 0, noise: 0 });
      const unsubs = [];
      for (let i = 0; i < SUBS; i++) {
        unsubs.push(
          valtioSubscribe(state, () => {
            void snapshot(state).count;
          }),
        );
      }
      let n = 0;
      return () => {
        state.count = ++n;
      };
    }),
    bench('nanostores', () => {
      const count = nanotom(0);
      const noise = nanotom(0);
      void noise;
      const unsubs = [];
      for (let i = 0; i < SUBS; i++) unsubs.push(count.listen(() => {}));
      let n = 0;
      return () => count.set(++n);
    }),
    bench('redux', () => {
      const reducer = (state = { count: 0, noise: 0 }, action) => {
        if (action.type === 'inc') return { ...state, count: action.n };
        return state;
      };
      const store = createReduxStore(reducer);
      const unsubs = [];
      for (let i = 0; i < SUBS; i++) {
        let prev = store.getState().count;
        unsubs.push(
          store.subscribe(() => {
            const next = store.getState().count;
            if (Object.is(prev, next)) return;
            prev = next;
          }),
        );
      }
      let n = 0;
      return () => store.dispatch({ type: 'inc', n: ++n });
    }),
  ];
}

/** Rewrite equal object: deep-equal stores should nearly no-op. */
function suiteDeepEqualSkip() {
  const same = { name: 'Ada', tags: ['a', 'b'] };
  return [
    bench('surgijs/store', () => {
      const store = createStore({ user: { name: 'Ada', tags: ['a', 'b'] } });
      let calls = 0;
      store.subscribe(
        (s) => s.user,
        () => {
          calls++;
        },
      );
      return () => {
        store.set('user', { name: 'Ada', tags: ['a', 'b'] });
        void calls;
        void same;
      };
    }),
    bench('zustand (ref eq)', () => {
      const store = createZustandStore(() => ({ user: { name: 'Ada', tags: ['a', 'b'] } }));
      store.subscribe((s) => s.user, () => {}, { equalityFn: Object.is });
      return () => store.setState({ user: { name: 'Ada', tags: ['a', 'b'] } });
    }),
    bench('jotai (ref eq)', () => {
      const userAtom = atom({ name: 'Ada', tags: ['a', 'b'] });
      const jstore = createJotaiStore();
      jstore.sub(userAtom, () => {});
      return () => jstore.set(userAtom, { name: 'Ada', tags: ['a', 'b'] });
    }),
    bench('valtio', () => {
      const state = proxy({ user: { name: 'Ada', tags: ['a', 'b'] } });
      valtioSubscribe(state, () => {});
      return () => {
        state.user = { name: 'Ada', tags: ['a', 'b'] };
      };
    }),
    bench('nanostores', () => {
      const user = nanotom({ name: 'Ada', tags: ['a', 'b'] });
      user.listen(() => {});
      return () => user.set({ name: 'Ada', tags: ['a', 'b'] });
    }),
    bench('redux', () => {
      const reducer = (state = { user: { name: 'Ada', tags: ['a', 'b'] } }, action) => {
        if (action.type === 'set') return { user: action.user };
        return state;
      };
      const store = createReduxStore(reducer);
      let prev = store.getState().user;
      store.subscribe(() => {
        const next = store.getState().user;
        if (Object.is(prev, next)) return;
        prev = next;
      });
      return () => store.dispatch({ type: 'set', user: { name: 'Ada', tags: ['a', 'b'] } });
    }),
  ];
}

/** Action + derived style update. */
function suiteActionDerived() {
  return [
    bench('surgijs/store action+derived', () => {
      const store = createStore({ count: 1 });
      const multiply = action((get, set, by) => set('count', get('count') * by));
      const double = derived((get) => get('count') * 2);
      store.subscribe((s) => s.count, () => {});
      return () => {
        multiply(store, 1);
        void double(store);
      };
    }),
    bench('zustand', () => {
      const store = createZustandStore((set, get) => ({
        count: 1,
        multiply: (by) => set({ count: get().count * by }),
      }));
      store.subscribe((s) => s.count, () => {}, { equalityFn: Object.is });
      return () => {
        store.getState().multiply(1);
        void store.getState().count * 2;
      };
    }),
    bench('jotai write atom', () => {
      const countAtom = atom(1);
      const multiplyAtom = atom(null, (get, set, by) => set(countAtom, get(countAtom) * by));
      const doubleAtom = atom((get) => get(countAtom) * 2);
      const jstore = createJotaiStore();
      jstore.sub(countAtom, () => {});
      return () => {
        jstore.set(multiplyAtom, 1);
        void jstore.get(doubleAtom);
      };
    }),
    bench('nanostores computed', () => {
      const count = nanotom(1);
      const double = nanoComputed(count, (v) => v * 2);
      count.listen(() => {});
      double.listen(() => {});
      return () => {
        count.set(count.get() * 1);
        void double.get();
      };
    }),
    bench('redux', () => {
      const reducer = (state = { count: 1 }, action) => {
        if (action.type === 'mul') return { count: state.count * action.by };
        return state;
      };
      const store = createReduxStore(reducer);
      store.subscribe(() => {});
      return () => {
        store.dispatch({ type: 'mul', by: 1 });
        void store.getState().count * 2;
      };
    }),
  ];
}

/** Noise update: subscribers watch another field — should stay quiet where possible. */
function suiteNoiseIsolation() {
  return [
    bench('surgijs/store', () => {
      const store = createStore({ count: 0, noise: 0 });
      for (let i = 0; i < SUBS; i++) store.subscribe((s) => s.count, () => {});
      let n = 0;
      return () => store.set('noise', ++n);
    }),
    bench('zustand', () => {
      const store = createZustandStore(() => ({ count: 0, noise: 0 }));
      for (let i = 0; i < SUBS; i++) {
        store.subscribe((s) => s.count, () => {}, { equalityFn: Object.is });
      }
      let n = 0;
      return () => store.setState({ noise: ++n });
    }),
    bench('jotai', () => {
      const countAtom = atom(0);
      const noiseAtom = atom(0);
      const jstore = createJotaiStore();
      for (let i = 0; i < SUBS; i++) jstore.sub(countAtom, () => {});
      let n = 0;
      return () => jstore.set(noiseAtom, ++n);
    }),
    bench('valtio', () => {
      const state = proxy({ count: 0, noise: 0 });
      for (let i = 0; i < SUBS; i++) {
        valtioSubscribe(
          state,
          () => {
            void state.count;
          },
          true,
        );
      }
      let n = 0;
      return () => {
        state.noise = ++n;
      };
    }),
    bench('nanostores', () => {
      const count = nanotom(0);
      const noise = nanotom(0);
      for (let i = 0; i < SUBS; i++) count.listen(() => {});
      let n = 0;
      return () => noise.set(++n);
    }),
    bench('redux', () => {
      const reducer = (state = { count: 0, noise: 0 }, action) => {
        if (action.type === 'noise') return { ...state, noise: action.n };
        return state;
      };
      const store = createReduxStore(reducer);
      for (let i = 0; i < SUBS; i++) {
        let prev = store.getState().count;
        store.subscribe(() => {
          const next = store.getState().count;
          if (!Object.is(prev, next)) prev = next;
        });
      }
      let n = 0;
      return () => store.dispatch({ type: 'noise', n: ++n });
    }),
  ];
}

const suites = [
  ['update watched field (' + SUBS + ' subs)', suiteUpdateWatched],
  ['deep-equal rewrite (skip notify)', suiteDeepEqualSkip],
  ['action + derived', suiteActionDerived],
  ['noise update (unrelated field)', suiteNoiseIsolation],
];

console.log(`@surgijs/store benches — ${ITER.toLocaleString()} iterations, ${SUBS} subscribers\n`);

const summary = [];
for (const [title, fn] of suites) {
  console.log(`## ${title}`);
  const rows = fn().sort((a, b) => a.ms - b.ms);
  const best = rows[0].ms;
  for (const row of rows) {
    const rel = (row.ms / best).toFixed(2) + 'x';
    console.log(`  ${pad(row.name, 28)} ${pad(row.ms.toFixed(1) + ' ms', 12)} ${pad(row.ops.toLocaleString() + ' ops/s', 16)} ${rel}`);
    summary.push({ suite: title, ...row, rel: row.ms / best });
  }
  console.log('');
}

const out = new URL('./results.json', import.meta.url);
await import('node:fs/promises').then((fs) =>
  fs.writeFile(out, JSON.stringify({ when: new Date().toISOString(), iter: ITER, subs: SUBS, results: summary }, null, 2)),
);
console.log(`wrote ${out.pathname}`);
