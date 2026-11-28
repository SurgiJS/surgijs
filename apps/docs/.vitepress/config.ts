import { defineConfig } from 'vitepress';
import llmstxt from 'vitepress-plugin-llms';
import surgi from '../../../packages/compiler/src/vite.ts';
import { workspaceSources } from '../../../tools/vite-workspace.ts';

/** Rules an agent gets wrong without them; llms.txt puts them before the page index. */
const LLM_DETAILS = `
Packages: \`@surgijs/core\` (runtime), \`@surgijs/compiler\` (Vite / esbuild plugin, required), \`@surgijs/store\` (state and remote data), \`@surgijs/ui\` (\`<s-button>\` and other elements).

Setup: \`tsconfig.json\` sets \`"jsx": "react-jsx"\` and \`"jsxImportSource": "@surgijs/core"\`; Vite uses \`surgi()\` from \`@surgijs/compiler/vite\`.

Rules that differ from React:

- A component function runs once. Props are getters: \`const { step } = props\`, then \`{step}\` in JSX and \`step()\` in code.
- \`useState\` returns \`[get, set]\`; read \`count()\` outside JSX and template literals.
- \`useEffect(fn, deps?)\` and \`useMemo(fn, deps?)\` take React-style arrays; \`[]\` runs once; without deps every signal read is tracked. No \`useCallback\`: functions are created once.
- Lists use \`<For each={items} by={(i) => i.id}>{(item, index) => ...}</For>\`, conditions \`<Show when={...}>\`.
- \`defineComponent(tag, render, schema, options)\` registers a custom element; schema keys become attributes (\`maxItems\` ↔ \`max-items\`) and properties.
- Inside components use \`use*\` hooks; outside components (modules, stores) use \`createSignal\`, \`createMemo\`, \`createEffect\`.
`;

export default defineConfig({
  title: 'SurgiJS',
  description: 'Compiled Web Components on JSX with fine-grained updates and a zero-dependency runtime.',
  base: process.env.DOCS_BASE ?? '/',
  cleanUrls: true,
  vue: {
    template: { compilerOptions: { isCustomElement: (tag) => tag.startsWith('s-') || ['my-counter', 'ui-dropdown', 'ui-virtual-table', 'ui-tile-grid'].includes(tag) } },
  },
  vite: {
    plugins: [
      surgi({ include: /(apps\/playground|packages\/ui)\/src\/.*\.tsx$/ }),
      // llms.txt, llms-full.txt and a .md copy of every page, for coding agents (llmstxt.org).
      llmstxt({
        domain: 'https://surgijs.github.io',
        description: 'Compiled web components on JSX/TSX with fine-grained signals, SSR to declarative shadow DOM, a store and an accessible UI kit.',
        details: LLM_DETAILS,
      }),
    ],
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
          { text: 'For React developers', link: '/guide/from-react' },
          { text: 'JSX to DOM', link: '/guide/jsx' },
          { text: 'Reactivity and hooks', link: '/guide/reactivity' },
          { text: 'Store', link: '/guide/store' },
          { text: 'Components', link: '/guide/components' },
          { text: 'Control flow', link: '/guide/control-flow' },
          { text: 'SSR and hydration', link: '/guide/ssr' },
          { text: 'Astro', link: '/guide/astro' },
          { text: 'Next.js App Router', link: '/guide/nextjs' },
          { text: 'Performance', link: '/guide/performance' },
        ],
      },
      {
        text: 'UI components',
        items: [
          { text: 'Overview and theming', link: '/ui/' },
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
