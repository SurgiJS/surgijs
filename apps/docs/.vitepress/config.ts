import { defineConfig } from 'vitepress';
import surgi from '../../../packages/compiler/src/vite.ts';
import { workspaceSources } from '../../../tools/vite-workspace.ts';

export default defineConfig({
  title: 'SurgiJS',
  description: 'Compiled Web Components on JSX with fine-grained updates and a zero-dependency runtime.',
  base: process.env.DOCS_BASE ?? '/',
  cleanUrls: true,
  vue: {
    template: { compilerOptions: { isCustomElement: (tag) => tag.startsWith('s-') || ['my-counter', 'ui-dropdown', 'ui-virtual-table', 'ui-tile-grid'].includes(tag) } },
  },
  vite: {
    plugins: [surgi({ include: /(apps\/playground|packages\/ui)\/src\/.*\.tsx$/ })],
    ...workspaceSources,
  },
  themeConfig: {
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'UI', link: '/ui/' },
      // Built by the docs workflow into /storybook/ and /playground/ next to the site.
      { text: 'Storybook', link: 'https://surgijs.github.io/surgijs/storybook/' },
      { text: 'Playground', link: 'https://surgijs.github.io/surgijs/playground/' },
      { text: 'API', link: '/api/' },
      { text: 'Benchmark', link: '/guide/performance' },
    ],
    sidebar: [
      {
        text: 'Guide',
        items: [
          { text: 'Getting started', link: '/guide/getting-started' },
          { text: 'JSX to DOM', link: '/guide/jsx' },
          { text: 'Reactivity and hooks', link: '/guide/reactivity' },
          { text: 'Store', link: '/guide/store' },
          { text: 'Components', link: '/guide/components' },
          { text: 'Control flow', link: '/guide/control-flow' },
          { text: 'SSR and hydration', link: '/guide/ssr' },
          { text: 'Performance', link: '/guide/performance' },
        ],
      },
      {
        text: 'UI components',
        items: [
          { text: 'Overview and theming', link: '/ui/' },
          { text: 'Design tokens', link: '/ui/tokens' },
          { text: 'Button', link: '/ui/button' },
          { text: 'Frameworks', link: '/ui/frameworks' },
        ],
      },
      {
        text: 'Reference',
        items: [
          { text: '@surgijs/core', link: '/api/' },
          { text: '@surgijs/compiler', link: '/api/compiler' },
          { text: 'Live examples', link: '/examples' },
        ],
      },
    ],
    socialLinks: [{ icon: 'github', link: 'https://github.com/SurgiJS/surgijs' }],
    footer: { message: 'MIT License' },
  },
});
