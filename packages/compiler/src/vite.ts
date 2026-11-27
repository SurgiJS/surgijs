import { compile } from './index.ts';

export interface SurgiVitePluginOptions {
  /** Runtime module imported by compiled code. Default `@surgijs/core`. */
  moduleName?: string;
  /**
   * Load `<moduleName>/devtools` while Vite is serving. Default: on for `@surgijs/core`, off for a
   * custom `moduleName` (turn it on when that runtime exports `./devtools`).
   */
  devtools?: boolean;
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
  transform(this: SurgiViteTransformContext | void, code: string, id: string): { code: string; map: SourceMapV3 | null } | null;
  transformIndexHtml: {
    order: 'pre';
    handler(): { tag: string; attrs: { type: string }; children: string; injectTo: 'head-prepend' }[] | undefined;
  };
}

interface SurgiViteConfigContext {
  meta?: object;
}

interface SurgiViteTransformContext {
  warn(message: string, position: { line: number; column: number }): void;
}

const DEFAULT = /\.[jt]sx$/;

/** Vite / Rollup plugin: compiles SurgiJS JSX before other transforms. */
export default function surgi(options: SurgiVitePluginOptions = {}): SurgiVitePlugin {
  const include = options.include;
  const runtime = options.moduleName ?? '@surgijs/core';
  const devtools = options.devtools ?? !options.moduleName;
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
    // Pre-order: Vite only resolves inline module imports for tags injected before its own HTML pass.
    transformIndexHtml: {
      order: 'pre',
      handler() {
        if (!serve || !devtools) return;
        return [
          {
            tag: 'script',
            attrs: { type: 'module' },
            children: `import { installDevtools } from ${JSON.stringify(`${runtime}/devtools`)};\ninstallDevtools();`,
            injectTo: 'head-prepend',
          },
        ];
      },
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
      for (const w of result.warnings) this?.warn(w.message, { line: w.line, column: w.column });
      if (!result.changed) return null;
      return { code: result.code, map: result.map ? (JSON.parse(result.map) as SourceMapV3) : null };
    },
  };
}

export { surgi };
