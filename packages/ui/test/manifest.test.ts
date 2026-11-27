import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { SButton } from '@surgijs/ui/button';
import { buildManifest, generatedFiles, type BuiltManifest, type CustomElementDeclaration } from '../scripts/manifest.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let manifest: BuiltManifest;
let button: CustomElementDeclaration;

beforeAll(() => {
  manifest = buildManifest();
  button = manifest.modules.flatMap((m) => m.declarations).find((d) => d.tagName === 's-button')!;
});

describe('custom elements manifest', () => {
  it('declares one custom element per defineComponent call', () => {
    const exported = manifest.modules.flatMap((m) => m.exports.map((e) => [e.kind, e.name, e.declaration.name]));
    expect(exported).toEqual([['custom-element-definition', 's-button', 'SButton']]);
    expect(button.name).toBe('SButton');
    expect(button.customElement).toBe(true);
  });

  it('lists the attributes in the order the runtime observes them', () => {
    expect(button.attributes.map((a) => a.name)).toEqual(SButton.observedAttributes);
  });

  it('takes types and defaults from the props interface', () => {
    const variant = button.attributes.find((a) => a.name === 'variant')!;
    expect(variant.type.text).toBe('"primary" | "secondary" | "ghost" | "danger"');
    expect(variant.default).toBe("'primary'");
    expect(variant.description).toBe('Visual style.');
    expect(button.attributes.find((a) => a.name === 'disabled')!.type.text).toBe('boolean');
  });

  it('marks primitive props as reflected properties', () => {
    const disabled = button.members.find((m) => m.name === 'disabled')!;
    expect(disabled).toMatchObject({ kind: 'field', attribute: 'disabled', reflects: true, default: 'false' });
  });

  it('lists slots, parts and custom properties from the view and styles', () => {
    expect(button.slots.map((s) => s.name)).toEqual(['start', '', 'end']);
    expect(button.cssParts.map((p) => p.name)).toEqual(['base', 'spinner']);
    expect(button.cssProperties.map((p) => p.name)).toContain('--s-button-bg');
    expect(button.cssProperties.every((p) => p.name.startsWith('--s-button-'))).toBe(true);
  });
});

describe('generated files', () => {
  it.each(Object.entries(generatedFiles(manifest)))('%s is up to date with the sources', (file, contents) => {
    expect(readFileSync(join(root, file), 'utf8'), `run \`pnpm generate\` in packages/ui to refresh ${file}`).toBe(contents);
  });
});
