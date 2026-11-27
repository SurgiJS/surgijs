import { defineComponent, type ComponentClass, type FormHost } from '@surgijs/core';
import { Button, type ButtonProps } from './button.view';
import { buttonStyles } from './button.styles';

export { Button, type ButtonProps, type ButtonSize, type ButtonType, type ButtonVariant } from './button.view';
export { buttonStyles } from './button.styles';

export const buttonSchema = {
  variant: String,
  size: String,
  type: String,
  disabled: Boolean,
  loading: Boolean,
  label: String,
} as const;

export type SButtonElement = FormHost & ButtonProps;

/**
 * `<s-button>`: form-associated (so a disabled `<fieldset>` disables it), with focus
 * delegated to the inner `<button>`.
 */
export const SButton: ComponentClass<ButtonProps> = defineComponent<ButtonProps>('s-button', Button, buttonSchema, {
  shadow: { mode: 'open', delegatesFocus: true },
  form: true,
  styles: buttonStyles,
});

declare global {
  interface HTMLElementTagNameMap {
    's-button': SButtonElement;
  }
}
