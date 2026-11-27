/**
 * Every visual value resolves as `var(--s-button-<name>, <variant/size default>)`. The
 * defaults come from the theme tokens in themes.css with built-in light fallbacks, so the
 * button renders without any stylesheet. Variants and sizes only change the `--_*` defaults,
 * which keeps a `--s-button-*` override working for every variant.
 */
export const buttonStyles = `
:host {
  display: inline-flex;
  vertical-align: middle;

  --_bg: var(--s-color-primary, #3451d1);
  --_bg-hover: var(--s-color-primary-hover, #2a43b3);
  --_bg-active: var(--s-color-primary-active, #223896);
  --_fg: var(--s-color-on-primary, #ffffff);
  --_border: transparent;

  --_height: 2.5rem;
  --_padding-x: 1rem;
  --_font-size: var(--s-font-size-md, 1rem);
}

:host([hidden]) {
  display: none;
}

:host([variant=secondary]) {
  --_bg: var(--s-color-surface, #ffffff);
  --_bg-hover: var(--s-color-surface-hover, #f1f3f5);
  --_bg-active: var(--s-color-surface-active, #e3e7eb);
  --_fg: var(--s-color-text, #1c1f26);
  --_border: var(--s-color-border, #c4c9d2);
}

:host([variant=ghost]) {
  --_bg: transparent;
  --_bg-hover: var(--s-color-surface-hover, #f1f3f5);
  --_bg-active: var(--s-color-surface-active, #e3e7eb);
  --_fg: var(--s-color-primary-text, #3451d1);
}

:host([variant=danger]) {
  --_bg: var(--s-color-danger, #c92a2a);
  --_bg-hover: var(--s-color-danger-hover, #a51f1f);
  --_bg-active: var(--s-color-danger-active, #861818);
  --_fg: var(--s-color-on-danger, #ffffff);
}

:host([size=sm]) {
  --_height: 2rem;
  --_padding-x: 0.75rem;
  --_font-size: var(--s-font-size-sm, 0.875rem);
}

:host([size=lg]) {
  --_height: 3rem;
  --_padding-x: 1.25rem;
  --_font-size: var(--s-font-size-lg, 1.125rem);
}

.base {
  box-sizing: border-box;
  display: inline-flex;
  flex: 1 1 auto;
  align-items: center;
  justify-content: center;
  gap: var(--s-button-gap, 0.5rem);
  min-height: var(--s-button-height, var(--_height));
  margin: 0;
  padding: 0 var(--s-button-padding-x, var(--_padding-x));
  font-family: var(--s-button-font-family, var(--s-font-family, inherit));
  font-size: var(--s-button-font-size, var(--_font-size));
  font-weight: var(--s-button-font-weight, var(--s-font-weight-medium, 500));
  line-height: 1.25;
  color: var(--s-button-fg, var(--_fg));
  background: var(--s-button-bg, var(--_bg));
  border: var(--s-button-border-width, 1px) solid var(--s-button-border-color, var(--_border));
  border-radius: var(--s-button-radius, var(--s-radius-md, 6px));
  cursor: pointer;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
  transition:
    background-color var(--s-duration-fast, 120ms),
    border-color var(--s-duration-fast, 120ms),
    color var(--s-duration-fast, 120ms);
}

.base:hover:not(:disabled, [aria-disabled=true]) {
  background: var(--s-button-bg-hover, var(--_bg-hover));
}

.base:active:not(:disabled, [aria-disabled=true]) {
  background: var(--s-button-bg-active, var(--_bg-active));
}

.base:focus-visible {
  outline: var(--s-button-focus-ring-width, 2px) solid var(--s-button-focus-ring-color, var(--s-color-focus, #4c6ef5));
  outline-offset: var(--s-button-focus-ring-offset, 2px);
}

.base:disabled,
.base[aria-disabled=true] {
  cursor: not-allowed;
  opacity: var(--s-button-disabled-opacity, 0.5);
}

.spinner {
  box-sizing: border-box;
  width: 1em;
  height: 1em;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: s-button-spin 0.7s linear infinite;
}

.spinner[hidden] {
  display: none;
}

@keyframes s-button-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .base {
    transition: none;
  }
  .spinner {
    animation-duration: 2s;
  }
}

@media (forced-colors: active) {
  .base {
    border-color: ButtonText;
  }
  .base:focus-visible {
    outline-color: Highlight;
  }
}
`;
