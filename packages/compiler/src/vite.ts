import { parseSync } from 'oxc-parser';
import { children, type Node } from './ast.ts';
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
  transform(code: string, id: string): { code: string; map: SourceMapV3 | null } | null;
  transformIndexHtml: {
    order: 'pre';
    handler(): { tag: string; attrs: { type: string }; children: string; injectTo: 'head-prepend' }[] | undefined;
  };
}

interface SurgiViteConfigContext {
  meta?: object;
}

const DEFAULT = /\.[jt]sx$/;

/** Whether the module calls `defineComponent`; mentions in comments, strings or declarations do not count. */
function definesComponent(file: string, code: string): boolean {
  if (!code.includes('defineComponent')) return false;
  const program = parseSync(file, code, { sourceType: 'module' }).program;
  const names = new Set(['defineComponent']);
  for (const s of program.body) {
    if (s.type !== 'ImportDeclaration') continue;
    for (const spec of s.specifiers) {
      if (spec.type !== 'ImportSpecifier') continue;
      const imported = spec.imported.type === 'Identifier' ? spec.imported.name : spec.imported.value;
      if (imported === 'defineComponent') names.add(spec.local.name);
    }
  }
  const stack: Node[] = [program as Node];
  while (stack.length) {
    const n = stack.pop()!;
    if (n.type === 'CallExpression') {
      const c = n.callee;
      if (c.type === 'Identifier' && names.has(c.name)) return true;
      if (c.type === 'MemberExpression' && !c.computed && c.property.type === 'Identifier' && c.property.name === 'defineComponent') return true;
    }
    stack.push(...children(n));
  }
  return false;
}

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
      const [file, query = ''] = id.split('?') as [string, string?];
      const generate = /(^|&)ssr(&|=|$)/.test(query) ? 'ssr' : options.generate;
      const result = matches(id)
        ? compile(code, {
            filename: file,
            ...(options.moduleName ? { moduleName: options.moduleName } : {}),
            ...(generate ? { generate } : {}),
          })
        : null;
      const changed = result?.changed === true;
      const refresh = generate !== 'ssr' && !file.startsWith('\0') && !file.includes('/node_modules/') && definesComponent(file, code);
      if (!changed && !refresh) return null;
      const source = changed ? result!.code : code;
      const out = refresh ? `${source}\nif (import.meta.hot) import.meta.hot.accept();\n` : source;
      return { code: out, map: changed && result!.map ? (JSON.parse(result!.map) as SourceMapV3) : null };
    },
  };
}

export { surgi };
