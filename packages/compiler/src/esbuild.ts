import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { compile } from './index.ts';

export interface SurgiEsbuildPluginOptions {
  moduleName?: string;
  /** Output mode. Imports with a `?ssr` query always compile for the server. */
  generate?: 'dom' | 'ssr';
  /** Files to compile. Default: `.jsx`/`.tsx` outside `node_modules`. */
  include?: RegExp | ((path: string) => boolean);
}

interface OnLoadArgs {
  path: string;
  suffix?: string;
}

interface PluginWarning {
  text: string;
  location: { file: string; line: number; column: number; lineText: string };
}

interface OnResolveArgs {
  path: string;
  resolveDir: string;
}

interface PluginBuild {
  onResolve(options: { filter: RegExp }, callback: (args: OnResolveArgs) => { path: string; suffix: string }): void;
  onLoad(
    options: { filter: RegExp },
    callback: (args: OnLoadArgs) => Promise<{ contents: string; loader: 'ts' | 'js'; warnings: PluginWarning[] } | undefined>,
  ): void;
}

export interface SurgiEsbuildPlugin {
  name: string;
  setup(build: PluginBuild): void;
}

const NODE_MODULES = /[\\/]node_modules[\\/]/;

/** esbuild plugin: compiles `.jsx`/`.tsx` and hands TypeScript or JavaScript to esbuild. */
export default function surgi(options: SurgiEsbuildPluginOptions = {}): SurgiEsbuildPlugin {
  const include = options.include;
  const matches = (path: string): boolean => {
    if (typeof include === 'function') return include(path);
    if (include) return include.test(path);
    return !NODE_MODULES.test(path);
  };
  return {
    name: 'surgijs',
    setup(build) {
      build.onResolve({ filter: /\.[jt]sx\?ssr$/ }, (args) => ({
        path: resolve(args.resolveDir, args.path.slice(0, -4)),
        suffix: '?ssr',
      }));
      build.onLoad({ filter: /\.[jt]sx$/ }, async (args) => {
        if (!matches(args.path)) return undefined;
        const source = await readFile(args.path, 'utf8');
        const generate = args.suffix === '?ssr' ? 'ssr' : options.generate;
        const result = compile(source, {
          filename: args.path,
          ...(options.moduleName ? { moduleName: options.moduleName } : {}),
          ...(generate ? { generate } : {}),
        });
        let contents = result.code;
        if (result.map) contents += `\n//# sourceMappingURL=data:application/json;base64,${Buffer.from(result.map).toString('base64')}\n`;
        const lines = source.split('\n');
        const warnings = result.warnings.map((w) => ({
          text: w.message,
          location: { file: args.path, line: w.line, column: w.column, lineText: lines[w.line - 1] ?? '' },
        }));
        return { contents, warnings, loader: args.path.endsWith('.tsx') ? 'ts' : 'js' };
      });
    },
  };
}

export { surgi };
