export interface ManifestType {
  text: string;
}

export interface ManifestMember {
  kind: 'field';
  name: string;
  type: ManifestType;
  description?: string;
  default?: string;
  attribute: string;
  reflects?: boolean;
}

export interface ManifestAttribute {
  name: string;
  fieldName: string;
  type: ManifestType;
  description?: string;
  default?: string;
}

export interface ManifestNamed {
  name: string;
  description?: string;
}

export interface CustomElementDeclaration {
  kind: 'class';
  name: string;
  customElement: true;
  tagName: string;
  description?: string;
  members: ManifestMember[];
  attributes: ManifestAttribute[];
  slots: ManifestNamed[];
  cssParts: ManifestNamed[];
  cssProperties: ManifestNamed[];
}

export interface ManifestModule {
  kind: 'javascript-module';
  path: string;
  declarations: CustomElementDeclaration[];
  exports: {
    kind: 'custom-element-definition';
    name: string;
    declaration: { name: string; module: string };
  }[];
}

export interface ComponentInfo {
  tag: string;
  className: string;
  propsName: string;
  propsModule: string;
  props: { name: string; required: boolean }[];
}

export interface CustomElementsManifest {
  schemaVersion: string;
  modules: ManifestModule[];
}

export interface BuiltManifest extends CustomElementsManifest {
  components: ComponentInfo[];
}

export function buildManifest(): BuiltManifest;
export function renderReact(manifest: BuiltManifest): string;
export function renderVue(manifest: BuiltManifest): string;
export function renderAngular(manifest: BuiltManifest): string;
export function generatedFiles(manifest?: BuiltManifest): Record<string, string>;
export function generate(): void;
