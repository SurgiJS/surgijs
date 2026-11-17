import { readFile } from 'node:fs/promises';
import { compile } from './index.ts';

export interface SurgiEsbuildPluginOptions {
  moduleName?: string;
  generate?: 'dom' | 'ssr';
}

interface OnLoadArgs {
  path: string;
}

interface PluginBuild {
  onLoad(
    options: { filter: RegExp },
    callback: (args: OnLoadArgs) => Promise<{ contents: string; loader: 'ts' | 'js' }>,
  ): void;
}

export interface SurgiEsbuildPlugin {
  name: string;
  setup(build: PluginBuild): void;
}

/** esbuild plugin: compiles `.jsx`/`.tsx` and hands TypeScript or JavaScript to esbuild. */
export default function surgi(options: SurgiEsbuildPluginOptions = {}): SurgiEsbuildPlugin {
  return {
    name: 'surgijs',
    setup(build) {
      build.onLoad({ filter: /\.[jt]sx$/ }, async (args) => {
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
