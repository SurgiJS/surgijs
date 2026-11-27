import { fileURLToPath } from 'node:url';
import type { StorybookConfig } from '@storybook/web-components-vite';
import surgi from '../../../packages/compiler/src/vite.ts';

const core = fileURLToPath(new URL('../../../packages/surgijs/src/', import.meta.url));
const ui = fileURLToPath(new URL('../../../packages/ui/src/', import.meta.url));

const config: StorybookConfig = {
  framework: '@storybook/web-components-vite',
  stories: ['../stories/**/*.mdx', '../stories/**/*.stories.ts'],
  addons: ['@storybook/addon-docs', '@storybook/addon-a11y'],
  core: { disableTelemetry: true },
  // Stories run on the workspace sources, compiled by the SurgiJS Vite plugin.
  viteFinal: (vite) => ({
    ...vite,
    plugins: [surgi({ include: /packages\/ui\/src\/.*\.tsx$/ }), ...(vite.plugins ?? [])],
    resolve: {
      ...vite.resolve,
      alias: [
        { find: /^@surgijs\/core$/, replacement: `${core}index.ts` },
        { find: /^@surgijs\/core\/(.*)$/, replacement: `${core}$1.ts` },
        { find: /^@surgijs\/ui$/, replacement: `${ui}index.ts` },
        { find: /^@surgijs\/ui\/themes\.css$/, replacement: `${ui}themes.css` },
        { find: /^@surgijs\/ui\/custom-elements\.json$/, replacement: `${ui}../custom-elements.json` },
        { find: /^@surgijs\/ui\/(.*)$/, replacement: `${ui}$1/index.ts` },
      ],
    },
  }),
};

export default config;
