# Button

`<s-button>` renders a native `<button>` inside its shadow root. Keyboard activation, focus, the `button` role and form behavior come from the platform.

<div class="ui-demo">
  <s-button>Primary</s-button>
  <s-button variant="secondary">Secondary</s-button>
  <s-button variant="ghost">Ghost</s-button>
  <s-button variant="danger">Danger</s-button>
  <s-button disabled>Disabled</s-button>
  <s-button loading>Saving</s-button>
</div>

```html
<s-button>Primary</s-button>
<s-button variant="secondary">Secondary</s-button>
<s-button variant="ghost">Ghost</s-button>
<s-button variant="danger">Danger</s-button>
<s-button disabled>Disabled</s-button>
<s-button loading>Saving</s-button>
```

## Sizes

<div class="ui-demo">
  <s-button size="sm">Small</s-button>
  <s-button size="md">Medium</s-button>
  <s-button size="lg">Large</s-button>
</div>

```html
<s-button size="sm">Small</s-button>
<s-button size="md">Medium</s-button>
<s-button size="lg">Large</s-button>
```

## Attributes and properties

| Attribute / property | Type | Default | Description |
| --- | --- | --- | --- |
| `variant` | `'primary' \| 'secondary' \| 'ghost' \| 'danger'` | `primary` | visual style |
| `size` | `'sm' \| 'md' \| 'lg'` | `md` | height, padding, font size |
| `type` | `'button' \| 'submit' \| 'reset'` | `button` | `submit` calls `requestSubmit()` on the closest form, `reset` resets it |
| `disabled` | `boolean` | `false` | disables the inner button: out of the tab order, no clicks |
| `loading` | `boolean` | `false` | shows a spinner, sets `aria-busy` and `aria-disabled`, blocks clicks, stays focusable |
| `label` | `string` | | accessible name for buttons without text, set as `aria-label` |

Properties reflect to attributes, so `el.variant = 'danger'` and `variant="danger"` are the same.

## Slots and parts

| Slot | Content |
| --- | --- |
| (default) | the label |
| `start` | an icon before the label |
| `end` | an icon after the label |

| Part | Element |
| --- | --- |
| `base` | the inner `<button>` |
| `spinner` | the loading spinner |

```css
s-button::part(base) {
  text-transform: uppercase;
}
```

## Custom properties

Every visual value reads a `--s-button-*` property first, then the variant or size default, then the theme token. Variants change only the defaults, so an override applies to every variant.

<div class="ui-demo">
  <s-button style="--s-button-radius: 999px; --s-button-bg: #0b7285; --s-button-bg-hover: #095c6b; --s-button-bg-active: #074652">Pill</s-button>
  <s-button variant="secondary" style="--s-button-bg: #e6fcf5; --s-button-bg-hover: #c3fae8; --s-button-fg: #087f5b; --s-button-border-color: #087f5b; --s-button-border-width: 2px">Outline</s-button>
  <s-button style="--s-button-height: 3.5rem; --s-button-font-weight: 700; --s-button-padding-x: 2rem">Tall</s-button>
</div>

```html
<s-button style="--s-button-radius: 999px; --s-button-bg: #0b7285">Pill</s-button>
```

```css
/* every button in the toolbar */
.toolbar s-button {
  --s-button-height: 2rem;
}
/* only danger buttons */
s-button[variant='danger'] {
  --s-button-font-weight: 700;
}
```

| Property | Default |
| --- | --- |
| `--s-button-bg` | variant: `--s-color-primary`, `--s-color-surface`, `transparent`, `--s-color-danger` |
| `--s-button-bg-hover` | variant `-hover` color |
| `--s-button-bg-active` | variant `-active` color |
| `--s-button-fg` | `--s-color-on-primary`, `--s-color-text`, `--s-color-primary-text`, `--s-color-on-danger` |
| `--s-button-border-color` | `transparent`; `--s-color-border` for `secondary` |
| `--s-button-border-width` | `1px` |
| `--s-button-radius` | `--s-radius-md` |
| `--s-button-height` | `2rem` / `2.5rem` / `3rem` by size |
| `--s-button-padding-x` | `0.75rem` / `1rem` / `1.25rem` by size |
| `--s-button-gap` | `0.5rem` |
| `--s-button-font-family` | `--s-font-family` |
| `--s-button-font-size` | `--s-font-size-sm` / `-md` / `-lg` by size |
| `--s-button-font-weight` | `--s-font-weight-medium` |
| `--s-button-focus-ring-color` | `--s-color-focus` |
| `--s-button-focus-ring-width` | `2px` |
| `--s-button-focus-ring-offset` | `2px` |
| `--s-button-disabled-opacity` | `0.5` |

## Accessibility

- The accessible name is the slotted text; icon-only buttons take `label`.
- `disabled` uses the native attribute: the button leaves the tab order and assistive technology reports it as unavailable.
- `loading` keeps the button focusable, so focus does not jump away while an action runs, and announces it with `aria-busy="true"` and `aria-disabled="true"`.
- Focus is delegated: `el.focus()` focuses the inner button and the ring appears on `:focus-visible` only.
- A disabled `<fieldset>` disables the button (it is form-associated).
- The spinner slows down with `prefers-reduced-motion`, and borders and focus rings use system colors in forced-colors mode.

## Forms

```html
<form>
  <input name="email" type="email" required />
  <s-button type="submit">Subscribe</s-button>
  <s-button type="reset" variant="ghost">Clear</s-button>
</form>
```

`type="submit"` runs `form.requestSubmit()`, so constraint validation and `submit` listeners work as with a native button. The button uses its closest ancestor `<form>`; the `form="id"` attribute is not supported yet.

## Server rendering

```ts
import { renderButton } from '@surgijs/ui/server';

const html = renderButton({ variant: 'secondary', type: 'submit' }, 'Send');
// <s-button variant="secondary" type="submit"><template shadowrootmode="open" shadowrootdelegatesfocus>…</template>Send</s-button>
```

The second argument is light DOM HTML and is inserted as is: escape user content before passing it. On the client, enable hydration before registering the component so it adopts the server nodes instead of rendering again:

```ts
import { enableHydration } from '@surgijs/core/hydrate';

enableHydration();
await import('@surgijs/ui/button');
```
