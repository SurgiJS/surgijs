#!/usr/bin/env node
// Builds and tests a package against the lowest published @surgijs/core its peer range allows,
// so a peer range that admits a release the package cannot work with fails CI.
//
//   node tools/check-min-core.mjs <ui|store>
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(import.meta.url), '../..');
const pkgDir = process.argv[2];
if (!pkgDir) {
  console.error('usage: node tools/check-min-core.mjs <package dir in packages/>');
  process.exit(2);
}

const dir = join(root, 'packages', pkgDir);
const { name, peerDependencies } = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
const range = peerDependencies?.['@surgijs/core'];
if (!range) {
  console.error(`${name} has no @surgijs/core peer dependency`);
  process.exit(2);
}
if (range.startsWith('workspace:')) {
  console.error(`${name}: peer range "${range}" is not an npm range, so no release can be derived from it`);
  process.exit(1);
}

const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { stdio: 'inherit', ...opts });
const capture = (cmd, args) =>
  execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

const versions = (() => {
  let out;
  try {
    out = capture('npm', ['view', `@surgijs/core@${range}`, 'version', '--json']);
  } catch (error) {
    // npm exits with E404 when nothing on the registry satisfies the range.
    if (error.status === 1) return [];
    throw error;
  }
  return out.trim() ? [].concat(JSON.parse(out)) : [];
})();

const numeric = (v) => v.split('-')[0].split('.').map(Number);
const min = versions
  .filter((v) => !v.includes('-'))
  .sort((a, b) => {
    const [x, y] = [numeric(a), numeric(b)];
    return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
  })[0];

if (!min) {
  // The range asks for a release that is not on npm yet (it ships with the same changesets), so
  // there is nothing to test against; the regular job already runs against the workspace core.
  console.log(`::notice::${name}: no @surgijs/core release on npm satisfies "${range}", skipping`);
  process.exit(0);
}
console.log(`${name}: peer range "${range}", testing against @surgijs/core@${min}`);

const work = join(root, '.min-core', pkgDir);
const tsconfig = join(dir, 'tsconfig.min-core.json');
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });

try {
  run('npm', ['pack', `@surgijs/core@${min}`, '--pack-destination', work], { stdio: ['ignore', 'ignore', 'inherit'] });
  run('tar', ['-xzf', join(work, `surgijs-core-${min}.tgz`), '-C', work]);
  const core = join(work, 'package');

  // Type resolution: the published exports also list the workspace source condition, whose
  // files are not in the tarball, so map every entry point to its declaration file.
  const { exports } = JSON.parse(readFileSync(join(core, 'package.json'), 'utf8'));
  const paths = {};
  for (const [key, target] of Object.entries(exports)) {
    if (typeof target === 'object' && target.types) {
      paths['@surgijs/core' + key.slice(1)] = [join(core, target.types)];
    }
  }
  writeFileSync(
    tsconfig,
    JSON.stringify({ extends: './tsconfig.json', compilerOptions: { paths } }, null, 2),
  );

  const env = { ...process.env, SURGI_CORE_DIR: core };
  run('pnpm', ['exec', 'tsc', '--noEmit', '-p', tsconfig], { cwd: dir, env });
  run('pnpm', ['exec', 'tsup', '--tsconfig', tsconfig], { cwd: dir, env });
  run('pnpm', ['exec', 'vitest', 'run', '--project', pkgDir], { cwd: root, env });
} catch (error) {
  console.error(`::error::${name} fails against @surgijs/core@${min}, the lowest release its peer range "${range}" allows. Raise the range or keep the code working with ${min}.`);
  process.exitCode = error.status || 1;
} finally {
  rmSync(tsconfig, { force: true });
  rmSync(work, { recursive: true, force: true });
}
