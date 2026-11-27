import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { defaultClientConditions, defaultServerConditions } from 'vite';

/**
 * Export condition that maps every `@surgijs/*` entry point to its TypeScript source
 * (see `exports` in each package.json). TypeScript reads it from `customConditions` in
 * tsconfig.base.json; published consumers never set it, so they get `dist`.
 */
export const SOURCE_CONDITION = '@surgijs/source';

/**
 * Vite / Vitest / VitePress / Storybook config fragment: workspace packages resolve to their
 * sources, so dev servers, tests and examples need no build and no per-entry aliases.
 */
/**
 * `tools/check-min-core.mjs` sets SURGI_CORE_DIR to an unpacked npm release of `@surgijs/core`.
 * Its entry points then replace the workspace sources, so tests run against that release. The
 * published `exports` still list the source condition, which `files` leaves out, hence aliases
 * instead of a resolve condition.
 */
function publishedCoreAliases(dir: string | undefined) {
  if (!dir) return [];
  const { exports } = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
    exports: Record<string, { import?: string } | string>;
  };
  return Object.entries(exports).flatMap(([key, target]) => {
    const file = typeof target === 'object' ? target.import : undefined;
    if (!file) return [];
    const name = ('@surgijs/core' + key.slice(1)).replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
    return [{ find: new RegExp(`^${name}$`), replacement: join(dir, file) }];
  });
}

export const workspaceSources = {
  resolve: {
    conditions: [SOURCE_CONDITION, ...defaultClientConditions],
    alias: publishedCoreAliases(process.env.SURGI_CORE_DIR),
  },
  ssr: { resolve: { conditions: [SOURCE_CONDITION, ...defaultServerConditions] } },
};
