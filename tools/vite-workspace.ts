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
export const workspaceSources = {
  resolve: { conditions: [SOURCE_CONDITION, ...defaultClientConditions] },
  ssr: { resolve: { conditions: [SOURCE_CONDITION, ...defaultServerConditions] } },
};
