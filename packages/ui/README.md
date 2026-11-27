# @surgijs/ui

Accessible web components built with [SurgiJS](https://github.com/SurgiJS/surgijs), themed with CSS custom properties and ready for server rendering.

```bash
npm i @surgijs/ui @surgijs/core
```

```ts
import '@surgijs/ui/themes.css';
import '@surgijs/ui';
```

```html
<s-button variant="primary">Save</s-button>
```

Entry points: `@surgijs/ui` (all components), `@surgijs/ui/button`, `@surgijs/ui/server` (`renderButton` for SSR), `@surgijs/ui/themes.css` (light and dark tokens), `@surgijs/ui/react` and `@surgijs/ui/vue` (JSX and `GlobalComponents` typings), `@surgijs/ui/angular` (directives with typed inputs), `@surgijs/ui/custom-elements.json` (Custom Elements Manifest).

Documentation: https://surgijs.github.io/surgijs/ui/ · Storybook: https://surgijs.github.io/surgijs/storybook/
