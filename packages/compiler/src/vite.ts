import { compile } from './index.ts';

export interface SurgiVitePluginOptions {
  /** Runtime module imported by compiled code. Default `@surgijs/core`. */
  moduleName?: string;
  /** Files to compile. Default: `.jsx`/`.tsx` outside `node_modules`. */
  include?: RegExp | ((id: string) => boolean);
  /** Output mode. Imports with a `?ssr` query always compile for the server. */
  generate?: 'dom' | 'ssr';
}

export interface SourceMapV3 {
  version: number;
  file: string;
  sources: string[];
  sourcesContent: string[];
  names: string[];
  mappings: string;
}

export interface SurgiVitePlugin {
  name: string;
  enforce: 'pre';
  config(this: SurgiViteConfigContext | void): { esbuild: { jsx: 'preserve' } };
  configResolved(config: { command: string }): void;
  transform(code: string, id: string): { code: string; map: SourceMapV3 | null } | null;
  transformIndexHtml(): { tag: string; attrs: { type: string }; children: string; injectTo: 'head-prepend' }[] | undefined;
}

interface SurgiViteConfigContext {
  meta?: object;
}

const DEFAULT = /\.[jt]sx$/;

/** Vite / Rollup plugin: compiles SurgiJS JSX before other transforms. */
export default function surgi(options: SurgiVitePluginOptions = {}): SurgiVitePlugin {
  const include = options.include;
  const runtime = options.moduleName ?? '@surgijs/core';
  let serve = false;
  const matches = (id: string): boolean => {
    const file = id.split('?')[0]!;
    if (typeof include === 'function') return include(file);
    if (include) return include.test(file);
    return DEFAULT.test(file) && !file.includes('/node_modules/');
  };
  return {
    name: 'surgijs',
    enforce: 'pre',
    config() {
      // Vite 8 runs on Rolldown and Oxc: the `esbuild` option is deprecated there. Vite 7 types
      // have no `oxc` key, so the Vite 8 branch is cast to the declared shape.
      const rolldown = (this?.meta as { rolldownVersion?: string } | undefined)?.rolldownVersion;
      return rolldown ? ({ oxc: { jsx: 'preserve' } } as unknown as { esbuild: { jsx: 'preserve' } }) : { esbuild: { jsx: 'preserve' } };
    },
    configResolved(config) {
      serve = config.command === 'serve';
    },
    transformIndexHtml() {
      if (!serve) return;
      return [
        {
          tag: 'script',
          attrs: { type: 'module' },
          children: `import { installDevtools } from ${JSON.stringify(`${runtime}/devtools`)};\ninstallDevtools();`,
          injectTo: 'head-prepend',
        },
      ];
    },
    transform(code, id) {
      if (!matches(id)) return null;
      const [file, query = ''] = id.split('?') as [string, string?];
      const generate = /(^|&)ssr(&|=|$)/.test(query) ? 'ssr' : options.generate;
      const result = compile(code, {
        filename: file,
        ...(options.moduleName ? { moduleName: options.moduleName } : {}),
        ...(generate ? { generate } : {}),
      });
      if (!result.changed) return null;
      return { code: result.code, map: result.map ? (JSON.parse(result.map) as SourceMapV3) : null };
    },
  };
}

export { surgi };
