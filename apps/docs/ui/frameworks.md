# Frameworks

Components are standard custom elements, so React, Vue and Angular render them without wrappers. The package also ships the metadata that editors and typecheckers use to know the element's API.

## Custom Elements Manifest

`@surgijs/ui/custom-elements.json` is a [Custom Elements Manifest](https://github.com/webcomponents/custom-elements-manifest) (schema 2.1.0). `package.json` points to it with the `customElements` field, which is where tools look for it. For each element it lists:

- the tag name and class;
- attributes, with the TypeScript type, default and description of the matching prop;
- properties, which reflect to the attributes;
- slots, CSS parts and the `--s-*` custom properties the styles read.

[Storybook](https://surgijs.github.io/surgijs/storybook/) reads it for the autodocs page and the Controls of every story (`setCustomElementsManifest` in `apps/storybook/.storybook/preview.ts`).

The manifest comes from the `defineComponent` calls and the props interfaces in `packages/ui/src`, so it describes what the runtime observes: the attribute list matches `observedAttributes`.

## React

The React typing requires React 19. React 19 passes each prop to a custom element as a property when the element defines it, and as an attribute otherwise, so `<s-button>` works as written. To get props checked and autocompleted in JSX, import the typing once in the project:

```ts
import '@surgijs/ui/react';
```

```tsx
<s-button variant="danger" size="sm" label="Close" onClick={remove}>
  Delete
</s-button>
```

The element accepts the props of `ButtonProps` and the standard HTML attributes, `className` and `ref`. An unknown `variant` is a type error.

## Vue

Vue must treat the `s-` tags as native elements instead of components. Set `isCustomElement` in the compiler options, for example in `vite.config.ts`:

```ts
vue({
  template: {
    compilerOptions: { isCustomElement: (tag) => tag.startsWith('s-') },
  },
});
```

Then import the typing once, next to the app entry:

```ts
import '@surgijs/ui/vue';
```

With `vue-tsc`, `<s-button>` gets the props of `ButtonProps`. Write the tag in templates; `SButton` is the key the typing uses and is not registered as a component:

```vue
<template>
  <s-button variant="ghost" :loading="busy">Save</s-button>
</template>
```

## Angular

Angular accepts custom elements with the `CUSTOM_ELEMENTS_SCHEMA` schema in the component or module that uses them. The package does not ship Angular typings yet; the manifest is the input for them.

## Regenerating

The manifest and the React and Vue typings are generated from the components. After changing a component, run `pnpm --filter @surgijs/ui generate`. The test suite fails when the committed files are stale.
