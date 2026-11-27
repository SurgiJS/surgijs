import type { FormHost, ReactiveProps } from '@surgijs/core';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';
export type ButtonType = 'button' | 'submit' | 'reset';

export interface ButtonProps {
  /** Visual style. Default `primary`. */
  variant?: ButtonVariant;
  /** Height, padding and font size. Default `md`. */
  size?: ButtonSize;
  /** `submit` submits and `reset` resets the closest form. Default `button`. */
  type?: ButtonType;
  /** Removes the button from the tab order and blocks clicks. */
  disabled?: boolean;
  /** Shows a spinner, sets `aria-busy` and blocks clicks while keeping focus. */
  loading?: boolean;
  /** Accessible name for buttons without text, such as icon-only buttons. */
  label?: string;
}

/**
 * The view behind `<s-button>`: a native `<button>` in the shadow root, so keyboard,
 * focus and the accessible role come from the platform. The label comes from slotted
 * content or the `label` prop. On the server `host` is undefined.
 */
export const Button = (props: ReactiveProps<ButtonProps>, host?: HTMLElement) => {
  const { disabled, loading, label, type } = props;
  const formDisabled = (host as FormHost | undefined)?.formDisabled;
  const isDisabled = () => !!disabled() || !!formDisabled?.();
  const isBusy = () => !!loading();

  const onClick = (e: MouseEvent) => {
    if (isDisabled() || isBusy()) {
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }
    const form = host?.closest('form');
    if (!form) return;
    if (type() === 'submit') form.requestSubmit();
    else if (type() === 'reset') form.reset();
  };

  return (
    <button
      type="button"
      class="base"
      part="base"
      disabled={isDisabled()}
      aria-disabled={isBusy() ? 'true' : undefined}
      aria-busy={isBusy() ? 'true' : undefined}
      aria-label={label()}
      on:click={onClick}
    >
      <span class="spinner" part="spinner" aria-hidden="true" hidden={!isBusy()}></span>
      <slot name="start"></slot>
      <slot></slot>
      <slot name="end"></slot>
    </button>
  );
};
