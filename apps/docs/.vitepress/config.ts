import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitepress';
import surgi from '../../../packages/compiler/src/vite.ts';

const runtime = fileURLToPath(new URL('../../../packages/surgijs/src/', import.meta.url));

export default defineConfig({
  title: 'SurgiJS',
  description: 'Compiled Web Components on JSX with fine-grained updates and a zero-dependency runtime.',
  base: process.env.DOCS_BASE ?? '/',
  cleanUrls: true,
  vue: {
    template: { compilerOptions: { isCustomElement: (tag) => ['my-counter', 'ui-dropdown', 'ui-virtual-table', 'ui-tile-grid'].includes(tag) } },
  },
  vite: {
    plugins: [surgi({ include: /apps\/playground\/src\/.*\.tsx$/ })],
    resolve: {
      alias: [
        { find: /^surgijs$/, replacement: `${runtime}index.ts` },
        { find: /^surgijs\/(.*)$/, replacement: `${runtime}$1.ts` },
      ],
    },
  },
  themeConfig: {
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
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
        text: 'Reference',
        items: [
          { text: 'surgijs', link: '/api/' },
          { text: '@surgijs/compiler', link: '/api/compiler' },
          { text: 'Live examples', link: '/examples' },
        ],
      },
    ],
    socialLinks: [{ icon: 'github', link: 'https://github.com/SurgiJS/surgijs' }],
    footer: { message: 'MIT License' },
  },
});
