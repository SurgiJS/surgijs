# UI components

`@surgijs/ui` is a set of accessible web components built with SurgiJS. Each one wraps native elements in a shadow root, takes its look from CSS custom properties, and renders on the server with declarative shadow DOM.

::: warning Not published yet
The package lives in `packages/ui` and is not on npm yet. The API below is what the first release will ship.
:::

## Install and register

```bash
npm i @surgijs/ui @surgijs/core
```

```ts
import '@surgijs/ui/themes.css'; // design tokens, light and dark
import '@surgijs/ui'; // registers every component, or:
import '@surgijs/ui/button'; // registers <s-button> only
```

```html
<s-button variant="primary">Save</s-button>
```

Components work without `themes.css`: every value has a built-in light fallback. The stylesheet adds the dark theme and lets you change tokens in one place.

## Themes

`themes.css` defines tokens on `:root`. Light is the default, `data-theme="dark"` on any ancestor switches to dark, and without a `data-theme` on the root the OS preference (`prefers-color-scheme`) decides.

```html
<html data-theme="dark">
```

Custom properties inherit through shadow roots, so a theme is a set of token values on any element:

```css
.brand {
  --s-color-primary: #0b7285;
  --s-color-primary-hover: #095c6b;
  --s-color-primary-active: #074652;
  --s-radius-md: 999px;
}
```

### Tokens

| Token | Light | Used for |
| --- | --- | --- |
| `--s-font-family` | system UI stack | text in components |
| `--s-font-size-sm` / `-md` / `-lg` | `0.875rem` / `1rem` / `1.125rem` | sizes `sm` / `md` / `lg` |
| `--s-font-weight-medium` | `500` | button labels |
| `--s-radius-sm` / `-md` / `-lg` / `-full` | `4px` / `6px` / `8px` / `999px` | corners |
| `--s-duration-fast` | `120ms` | hover and press transitions |
| `--s-color-primary` (`-hover`, `-active`) | `#3451d1` | primary backgrounds |
| `--s-color-primary-text` | `#3451d1` | primary-colored text on surfaces |
| `--s-color-on-primary` | `#ffffff` | text on primary |
| `--s-color-danger` (`-hover`, `-active`) | `#c92a2a` | destructive actions |
| `--s-color-on-danger` | `#ffffff` | text on danger |
| `--s-color-surface` (`-hover`, `-active`) | `#ffffff` | neutral backgrounds |
| `--s-color-text` | `#1c1f26` | text on surfaces |
| `--s-color-border` | `#c4c9d2` | outlines |
| `--s-color-focus` | `#4c6ef5` | focus rings |

## Component custom properties

Each component also has its own properties, named `--s-<component>-*`. They default to the tokens and win over them, so you can restyle one component, one group or one element without touching the theme. See [Button](./button#custom-properties).

## Quality checks

Every component ships with:

- unit tests (Vitest, happy-dom) for behavior, ARIA and forms;
- SSR tests: the server markup, the stylesheet, and hydration that adopts the server nodes;
- Storybook stories, which are also the source of the browser tests;
- Playwright tests in Chromium, Firefox and WebKit: keyboard, focus, forms, axe-core accessibility audits (WCAG 2.2 AA) in both themes, and a server-rendered page that must look the same before and after hydration;
- visual regression screenshots of every story in both themes, taken in the official Playwright container.
