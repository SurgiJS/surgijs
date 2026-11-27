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
  config(): { esbuild: { jsx: 'preserve' } };
  transform(code: string, id: string): { code: string; map: SourceMapV3 | null } | null;
}

const DEFAULT = /\.[jt]sx$/;

/** Vite / Rollup plugin: compiles SurgiJS JSX before other transforms. */
export default function surgi(options: SurgiVitePluginOptions = {}): SurgiVitePlugin {
  const include = options.include;
  const matches = (id: string): boolean => {
    const file = id.split('?')[0]!;
    if (typeof include === 'function') return include(file);
    if (include) return include.test(file);
    return DEFAULT.test(file) && !file.includes('/node_modules/');
  };
  return {
    name: 'surgijs',
    enforce: 'pre',
    config: () => ({ esbuild: { jsx: 'preserve' } }),
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
