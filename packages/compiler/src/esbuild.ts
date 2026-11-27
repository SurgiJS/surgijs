import { readFile } from 'node:fs/promises';
import { compile } from './index.ts';

export interface SurgiEsbuildPluginOptions {
  moduleName?: string;
  generate?: 'dom' | 'ssr';
  /** Files to compile. Default: `.jsx`/`.tsx` outside `node_modules`. */
  include?: RegExp | ((path: string) => boolean);
}

interface OnLoadArgs {
  path: string;
}

interface PluginBuild {
  onLoad(
    options: { filter: RegExp },
    callback: (args: OnLoadArgs) => Promise<{ contents: string; loader: 'ts' | 'js' } | undefined>,
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
      build.onLoad({ filter: /\.[jt]sx$/ }, async (args) => {
        if (!matches(args.path)) return undefined;
        const source = await readFile(args.path, 'utf8');
        const result = compile(source, {
          filename: args.path,
          ...(options.moduleName ? { moduleName: options.moduleName } : {}),
          ...(options.generate ? { generate: options.generate } : {}),
        });
        let contents = result.code;
        if (result.map) contents += `\n//# sourceMappingURL=data:application/json;base64,${Buffer.from(result.map).toString('base64')}\n`;
        return { contents, loader: args.path.endsWith('.tsx') ? 'ts' : 'js' };
      });
    },
  };
}

export { surgi };
