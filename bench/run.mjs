#!/usr/bin/env node
/**
 * `pnpm bench [ids...] [--rows N]`: bundles each case (minified production build), serves this
 * directory, runs the harness in headless Chrome over CDP and writes `results.json`
 * (1000 rows) or `results-N.json`.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { build } from 'esbuild';

const dir = fileURLToPath(new URL('.', import.meta.url));
const require = createRequire(import.meta.url);
const version = (name) => JSON.parse(readFileSync(join(dir, 'node_modules', name, 'package.json'), 'utf8')).version;
const own = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')).version;

const CASES = [
  { id: 'native', name: 'Native', entry: 'native.js', version: () => '' },
  { id: 'surgijs', name: 'SurgiJS', entry: 'surgijs.tsx', version: () => own('../packages/surgijs/package.json') },
  { id: 'solid', name: 'Solid', entry: 'solid.jsx', version: () => version('solid-js') },
  { id: 'inferno', name: 'Inferno', entry: 'inferno.js', version: () => version('inferno') },
  { id: 'lit', name: 'lit-html', entry: 'lit.js', version: () => version('lit-html') },
  { id: 'fast', name: 'FAST Element', entry: 'fast.js', version: () => version('@microsoft/fast-element') },
  { id: 'svelte', name: 'Svelte', entry: 'svelte.js', version: () => version('svelte') },
  { id: 'vue', name: 'Vue', entry: 'vue.js', version: () => version('vue') },
  { id: 'react', name: 'React', entry: 'react.js', version: () => version('react') },
];

const CHROME = process.env.CHROME_PATH || '/usr/local/bin/google-chrome';
const PORT = 9334;

function parseArgs(argv) {
  const ids = [];
  let rows = 1000;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--rows') rows = Number(argv[++i]);
    else if (a.startsWith('--rows=')) rows = Number(a.slice(7));
    else if (a !== '--') ids.push(a);
  }
  if (!Number.isInteger(rows) || rows < 2) throw new Error('--rows expects an integer >= 2');
  const unknown = ids.filter((id) => !CASES.some((c) => c.id === id));
  if (unknown.length) throw new Error(`unknown case: ${unknown.join(', ')}`);
  return { rows, cases: ids.length ? CASES.filter((c) => ids.includes(c.id)) : CASES };
}

const plugins = {
  /** `.tsx` through the workspace compiler; `@surgijs/core` resolves to sources by condition. */
  surgijs: {
    name: 'surgijs',
    setup(b) {
      b.onLoad({ filter: /\.tsx$/ }, async (args) => {
        const { compile } = await import('../packages/compiler/src/index.ts');
        const { code } = compile(await readFile(args.path, 'utf8'), { filename: args.path, sourceMap: false });
        return { contents: code, loader: 'ts' };
      });
    },
  },
  solid: {
    name: 'solid',
    setup(b) {
      b.onLoad({ filter: /\.jsx$/ }, async (args) => {
        const babel = await import('@babel/core');
        const { code } = await babel.transformAsync(await readFile(args.path, 'utf8'), {
          filename: args.path,
          presets: [require.resolve('babel-preset-solid')],
          babelrc: false,
          configFile: false,
        });
        return { contents: code, loader: 'js' };
      });
    },
  },
  svelte: {
    name: 'svelte',
    setup(b) {
      b.onLoad({ filter: /\.svelte$/ }, async (args) => {
        const { compile } = await import('svelte/compiler');
        const { js } = compile(await readFile(args.path, 'utf8'), { filename: args.path, generate: 'client' });
        return { contents: js.code, loader: 'js' };
      });
    },
  },
};

async function bundle(c) {
  const result = await build({
    entryPoints: [join(dir, 'cases', c.entry)],
    bundle: true,
    write: false,
    minify: true,
    format: 'esm',
    target: 'es2022',
    platform: 'browser',
    conditions: ['@surgijs/source', 'production', 'browser'],
    legalComments: 'none',
    define: {
      'process.env.NODE_ENV': '"production"',
      __VUE_OPTIONS_API__: 'false',
      __VUE_PROD_DEVTOOLS__: 'false',
      __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false',
    },
    plugins: plugins[c.id] ? [plugins[c.id]] : [],
    logLevel: 'error',
  });
  return result.outputFiles[0].text;
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript' };

function serve(files) {
  const server = createServer(async (req, res) => {
    const path = new URL(req.url, 'http://x').pathname;
    const body = files.get(path) ?? (path === '/' ? null : await readFile(join(dir, path)).catch(() => null));
    if (body == null) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, {
      'content-type': MIME[extname(path)] ?? 'application/octet-stream',
      'cache-control': 'no-store',
      // Cross-origin isolation raises performance.now() precision to 5 µs.
      'cross-origin-opener-policy': 'same-origin',
      'cross-origin-embedder-policy': 'require-corp',
    });
    res.end(body);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function waitFor(fn, ms) {
  const end = Date.now() + ms;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      if (Date.now() > end) throw err;
      await new Promise((r) => setTimeout(r, 100));
    }
  }
}

function launchChrome() {
  const profile = mkdtempSync(join(tmpdir(), 'surgijs-bench-'));
  const proc = spawn(
    CHROME,
    [
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu',
      '--js-flags=--expose-gc',
      '--enable-precise-memory-info',
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--no-default-browser-check',
      'about:blank',
    ],
    { stdio: 'ignore', detached: true },
  );
  return {
    proc,
    async close() {
      const exited = new Promise((resolve) => proc.once('exit', resolve));
      process.kill(-proc.pid);
      await exited;
      rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    },
  };
}

const devtools = (path, method = 'GET') =>
  fetch(`http://127.0.0.1:${PORT}${path}`, { method }).then((r) => {
    if (!r.ok) throw new Error(`${path}: ${r.status}`);
    return r.json();
  });

/** Minimal CDP session over the page target's WebSocket. */
async function connect(url) {
  const ws = new WebSocket(url);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  let seq = 0;
  const pending = new Map();
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    if (msg.error) p.reject(new Error(msg.error.message));
    else p.resolve(msg.result);
  };
  return {
    send(method, params = {}) {
      const id = ++seq;
      ws.send(JSON.stringify({ id, method, params }));
      return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    },
    close: () => ws.close(),
  };
}

async function evaluate(session, expression, timeout) {
  const { result, exceptionDetails } = await session.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    timeout,
  });
  if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
  return result.value;
}

async function runCase(origin, c, rows) {
  const target = await devtools(`/json/new?${origin}/index.html`, 'PUT');
  const session = await connect(target.webSocketDebuggerUrl);
  try {
    await session.send('Runtime.enable');
    await waitFor(async () => {
      if (!(await evaluate(session, 'window.ready === true', 5000))) throw new Error('page is loading');
    }, 30000);
    const timeout = Math.max(180000, rows * 40);
    return await evaluate(session, `bench(${JSON.stringify(c.id)}, ${rows})`, timeout);
  } finally {
    session.close();
    await devtools(`/json/close/${target.id}`).catch(() => {});
  }
}

const COLUMNS = ['init', 'init+layout', 'redrawOne', 'redrawAll', 'redrawAll+layout', 'toggleOne', 'toggleAll'];
const kb = (bytes) => (bytes / 1024).toFixed(1);
const mb = (bytes) => (bytes / 1048576).toFixed(2);

function table(libs) {
  const head = ['lib', ...COLUMNS, 'heap MB', 'alloc MB', 'gzip KB'];
  const body = Object.values(libs).map((r) => [
    `${r.name} ${r.version}`.trim(),
    ...COLUMNS.map((k) => r.time[k].toFixed(2)),
    mb(r.memory.retained),
    mb(r.memory.redrawAll),
    kb(r.gzip),
  ]);
  const widths = head.map((h, i) => Math.max(h.length, ...body.map((row) => row[i].length)));
  const line = (cells) => cells.map((v, i) => (i ? v.padStart(widths[i]) : v.padEnd(widths[i]))).join('  ');
  return [line(head), ...body.map(line)].join('\n');
}

async function main() {
  const { rows, cases } = parseArgs(process.argv.slice(2));
  const files = new Map();
  const sizes = {};
  for (const c of cases) {
    const code = await bundle(c);
    files.set(`/dist/${c.id}.js`, code);
    sizes[c.id] = gzipSync(code, { level: 9 }).length;
  }
  const server = await serve(files);
  const origin = `http://127.0.0.1:${server.address().port}`;
  const chrome = launchChrome();
  try {
    const { Browser } = await waitFor(() => devtools('/json/version'), 15000);
    console.log(`${Browser}, ${rows} rows, median of 21 runs after 4 warmups (ms)\n`);
    const libs = {};
    for (const c of cases) {
      process.stdout.write(`running ${c.id}...\n`);
      const result = await runCase(origin, c, rows);
      libs[c.id] = { name: c.name, version: c.version(), gzip: sizes[c.id], ...result };
    }
    console.log(`\n${table(libs)}`);
    const file = rows === 1000 ? 'results.json' : `results-${rows}.json`;
    const out = { browser: Browser, rows, date: new Date().toISOString(), libs };
    writeFileSync(join(dir, file), `${JSON.stringify(out, null, 2)}\n`);
    console.log(`\nwrote bench/${file}`);
  } finally {
    server.close();
    await chrome.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
