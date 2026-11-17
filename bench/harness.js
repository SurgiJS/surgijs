/**
 * Browser side of the benchmark. A case module exports `create(root)` that resolves to
 * `{ init(data), label(i, text), labels(texts), toggle(i), toggleAll(), commit(), dispose() }`.
 * Every timed operation ends with `commit()`, so the clock includes the library's own update flush.
 */

const median = (list) => {
  const sorted = [...list].sort((a, b) => a - b);
  return sorted[sorted.length >> 1];
};

const gc = () => window.gc?.();
const heap = () => performance.memory.usedJSHeapSize;
const layout = (root) => root.offsetHeight + document.body.offsetHeight;

async function settle(app) {
  const pending = app.commit();
  if (pending) await pending;
}

const text = (k) => (d) => `${d.label} ${k}`;

const SCENARIOS = {
  init: { init: false, op: (app, data) => app.init(data) },
  'init+layout': { init: false, layout: true, op: (app, data) => app.init(data) },
  redrawOne: { op: (app, data, k) => app.label(data.length >> 1, `edit ${k}`) },
  redrawAll: { arg: (data, k) => data.map(text(k)), op: (app, texts) => app.labels(texts) },
  'redrawAll+layout': { layout: true, arg: (data, k) => data.map(text(k)), op: (app, texts) => app.labels(texts) },
  toggleOne: { op: (app, data) => app.toggle(data.length >> 1) },
  toggleAll: { op: (app) => app.toggleAll() },
};

function check(root, n, expect) {
  const rows = root.querySelectorAll('.row');
  if (rows.length !== n) throw new Error(`expected ${n} rows, got ${rows.length}`);
  const probe = rows[n >> 1];
  const label = probe.querySelector('.label').textContent;
  if (expect.label !== undefined && label !== expect.label) throw new Error(`label "${label}" != "${expect.label}"`);
  if (expect.on !== undefined && probe.classList.contains('on') !== expect.on) throw new Error('row class did not toggle');
  if (probe.querySelector('.id').textContent !== String((n >> 1) + 1)) throw new Error('wrong row id');
}

async function mount(create, data) {
  const root = document.createElement('div');
  document.body.appendChild(root);
  const app = await create(root);
  return { root, app };
}

async function unmount({ root, app }) {
  app.dispose();
  await settle(app);
  document.body.removeChild(root);
}

/** Verifies that the case renders and updates the expected DOM. */
async function verify(create, data) {
  const n = data.length;
  const m = await mount(create, data);
  m.app.init(data);
  await settle(m.app);
  check(m.root, n, { label: data[n >> 1].label, on: false });
  m.app.labels(data.map(text('x')));
  await settle(m.app);
  check(m.root, n, { label: `${data[n >> 1].label} x` });
  m.app.label(n >> 1, 'one');
  await settle(m.app);
  check(m.root, n, { label: 'one' });
  m.app.toggle(n >> 1);
  await settle(m.app);
  check(m.root, n, { on: true });
  m.app.toggleAll();
  await settle(m.app);
  check(m.root, n, { on: false });
  if (m.root.querySelectorAll('.on').length !== n - 1) throw new Error('toggleAll missed rows');
  await unmount(m);
}

export async function run(create, n, { runs = 21, warmup = 4, memoryRuns = 9 } = {}) {
  const data = Array.from({ length: n }, (_, i) => ({ id: i + 1, label: `row ${i + 1}` }));
  await verify(create, data);
  const time = {};
  for (const [name, s] of Object.entries(SCENARIOS)) {
    const samples = [];
    for (let k = 0; k < warmup + runs; k++) {
      const m = await mount(create, data);
      if (s.init !== false) {
        m.app.init(data);
        await settle(m.app);
        layout(m.root);
      }
      const arg = s.arg ? s.arg(data, k) : data;
      gc();
      const t0 = performance.now();
      s.op(m.app, arg, k);
      await settle(m.app);
      if (s.layout) layout(m.root);
      const t = performance.now() - t0;
      if (k >= warmup) samples.push(t);
      await unmount(m);
    }
    time[name] = +median(samples).toFixed(2);
  }

  const retained = [];
  const allocated = [];
  for (let k = 0; k < memoryRuns; k++) {
    gc();
    const base = heap();
    const m = await mount(create, data);
    m.app.init(data);
    await settle(m.app);
    gc();
    const before = heap();
    retained.push(before - base);
    m.app.labels(data.map(text(k)));
    await settle(m.app);
    allocated.push(heap() - before);
    await unmount(m);
  }
  return { time, memory: { retained: median(retained), redrawAll: median(allocated) } };
}
