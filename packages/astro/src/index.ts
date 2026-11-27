import surgi, { type SurgiVitePluginOptions } from '@surgijs/compiler/vite';
import type { AstroIntegration } from 'astro';

export type SurgiAstroOptions = Pick<SurgiVitePluginOptions, 'include' | 'moduleName' | 'devtools'>;

/**
 * Astro integration for SurgiJS. It compiles `.tsx` components for the DOM in the browser and for
 * the server in Astro's SSR graph, registers the renderer that turns a component into declarative
 * shadow DOM, and turns on hydration before an island runs.
 */
export default function surgijs(options: SurgiAstroOptions = {}): AstroIntegration {
  return {
    name: '@surgijs/astro',
    hooks: {
      'astro:config:setup': ({ addRenderer, injectScript, updateConfig }) => {
        addRenderer({
          name: '@surgijs/astro',
          clientEntrypoint: '@surgijs/astro/client',
          serverEntrypoint: '@surgijs/astro/server',
        });
        injectScript('before-hydration', "import '@surgijs/astro/hydrate';");
        updateConfig({
          vite: {
            plugins: [surgi({ ...options, generate: 'auto' }) as never],
            ssr: { noExternal: [/^@surgijs\//] },
          },
        });
      },
    },
  };
}

export { surgijs };
