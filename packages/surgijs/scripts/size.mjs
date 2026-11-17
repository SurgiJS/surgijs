import { bundle, CASES } from './bundle.mjs';

let failed = false;
const rows = [];
for (const c of CASES) {
  const r = await bundle(c.entry);
  const ok = r.gzip <= c.limit;
  if (!ok) failed = true;
  rows.push({ case: c.name, min: r.min, gzip: r.gzip, brotli: r.brotli, limit: c.limit, status: ok ? 'ok' : 'OVER' });
}

const pad = (s, n, right = false) => (right ? String(s).padStart(n) : String(s).padEnd(n));
console.log(`${pad('case', 26)} ${pad('min', 7, true)} ${pad('gzip', 7, true)} ${pad('brotli', 7, true)} ${pad('limit', 7, true)}  status`);
for (const r of rows)
  console.log(`${pad(r.case, 26)} ${pad(r.min, 7, true)} ${pad(r.gzip, 7, true)} ${pad(r.brotli, 7, true)} ${pad(r.limit, 7, true)}  ${r.status}`);

if (failed) {
  console.error('\nSize budget exceeded.');
  process.exit(1);
}
