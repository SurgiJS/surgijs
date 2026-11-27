import type { StorybookConfig } from '@storybook/web-components-vite';
import surgi from '../../../packages/compiler/src/vite.ts';
import { workspaceSources } from '../../../tools/vite-workspace.ts';

const config: StorybookConfig = {
  framework: '@storybook/web-components-vite',
  stories: ['../stories/**/*.mdx', '../stories/**/*.stories.ts'],
  addons: ['@storybook/addon-docs', '@storybook/addon-a11y'],
  core: { disableTelemetry: true },
  // Stories run on the workspace sources, compiled by the SurgiJS Vite plugin.
  viteFinal: (vite) => ({
    ...vite,
    plugins: [surgi({ include: /packages\/ui\/src\/.*\.tsx$/ }), ...(vite.plugins ?? [])],
    resolve: { ...vite.resolve, ...workspaceSources.resolve },
  }),
};

export default config;
