import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { generatedFiles } from '../scripts/tokens.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file: string) => readFileSync(join(root, file), 'utf8');

const generated = await generatedFiles();

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

const customProperties = (css: string) => new Set([...css.matchAll(/--(s-[a-z0-9-]+):/g)].map((m) => m[1]!));

describe('design tokens', () => {
  it.each(Object.keys(generated))('%s is up to date with tokens/', (file) => {
    expect(existsSync(join(root, file)), `missing ${file}`).toBe(true);
    expect(read(file), `run \`pnpm generate\` in packages/ui to refresh ${relative(root, join(root, file))}`).toBe(generated[file]);
  });

  it('defines the same color tokens in light and dark', () => {
    const colors = (mode: 'light' | 'dark') =>
      Object.keys(JSON.parse(read(`tokens/${mode}.json`)).color).filter((key) => !key.startsWith('$'));
    expect(colors('dark')).toEqual(colors('light'));
  });

  it('exposes every theme token that components read', () => {
    const themed = customProperties(read('src/themes.css'));
    const used = new Set<string>();
    for (const file of sourceFiles(join(root, 'src'))) {
      for (const match of readFileSync(file, 'utf8').matchAll(/var\(--(s-(?:color|font|radius|duration)-[a-z0-9-]+)/g)) {
        used.add(match[1]!);
      }
    }
    expect(used.size).toBeGreaterThan(0);
    expect([...used].filter((name) => !themed.has(name))).toEqual([]);
  });

  it('gives Figma the same names as the stylesheet', () => {
    const figmaNames = (mode: 'light' | 'dark') => {
      const names: string[] = [];
      const walk = (node: Record<string, unknown>, path: string[]) => {
        for (const [key, value] of Object.entries(node)) {
          if (key.startsWith('$')) continue;
          const child = value as Record<string, unknown>;
          if ('$value' in child) names.push(`s-${[...path, key].join('-')}`);
          else walk(child, [...path, key]);
        }
      };
      walk(JSON.parse(read(`tokens/figma/${mode}.json`)), []);
      return names.sort();
    };
    expect(figmaNames('light')).toEqual([...customProperties(read('src/themes.css'))].sort());
    expect(figmaNames('dark')).toEqual(figmaNames('light'));
  });
});
