import type { Meta, StoryObj } from '@storybook/web-components-vite';
import { html, nothing } from 'lit';
import type { ButtonProps } from '@surgijs/ui';

type Args = ButtonProps & { text: string };

const plus = html`<svg slot="start" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 3v10M3 8h10" /></svg>`;

const meta = {
  title: 'Components/Button',
  component: 's-button',
  args: { text: 'Button', variant: 'primary', size: 'md', type: 'button', disabled: false, loading: false },
  argTypes: {
    text: { description: 'Slotted label (default slot)' },
    variant: { control: 'inline-radio', options: ['primary', 'secondary', 'ghost', 'danger'] },
    size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] },
    type: { control: 'inline-radio', options: ['button', 'submit', 'reset'] },
    disabled: { control: 'boolean' },
    loading: { control: 'boolean' },
    label: { control: 'text', description: 'Accessible name for icon-only buttons' },
  },
  render: (args) => html`<s-button
    variant=${args.variant ?? nothing}
    size=${args.size ?? nothing}
    type=${args.type ?? nothing}
    label=${args.label ?? nothing}
    ?disabled=${args.disabled}
    ?loading=${args.loading}
    >${args.text}</s-button
  >`,
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

export const Primary: Story = {};

export const Variants: Story = {
  render: () => html`<div style="display: flex; gap: 12px; flex-wrap: wrap">
    <s-button variant="primary">Primary</s-button>
    <s-button variant="secondary">Secondary</s-button>
    <s-button variant="ghost">Ghost</s-button>
    <s-button variant="danger">Danger</s-button>
  </div>`,
};

export const Sizes: Story = {
  render: () => html`<div style="display: flex; gap: 12px; align-items: center">
    <s-button size="sm">Small</s-button>
    <s-button size="md">Medium</s-button>
    <s-button size="lg">Large</s-button>
  </div>`,
};

export const Disabled: Story = {
  render: () => html`<div style="display: flex; gap: 12px">
    <s-button disabled>Primary</s-button>
    <s-button variant="secondary" disabled>Secondary</s-button>
    <s-button variant="ghost" disabled>Ghost</s-button>
    <s-button variant="danger" disabled>Danger</s-button>
  </div>`,
};

export const Loading: Story = {
  args: { loading: true, text: 'Saving' },
};

export const WithIcon: Story = {
  render: () => html`<s-button>${plus}Add item</s-button>`,
};

export const IconOnly: Story = {
  render: () => html`<s-button variant="secondary" label="Add item" style="--s-button-padding-x: 0.625rem">${plus}</s-button>`,
};

/** Every visual value is a `--s-button-*` custom property, overridable per element or group. */
export const CustomProperties: Story = {
  render: () => html`<div style="display: flex; gap: 12px; align-items: center">
    <s-button style="--s-button-radius: 999px; --s-button-bg: #0b7285; --s-button-bg-hover: #095c6b; --s-button-bg-active: #074652">Pill</s-button>
    <s-button variant="secondary" style="--s-button-bg: #e6fcf5; --s-button-bg-hover: #c3fae8; --s-button-bg-active: #96f2d7; --s-button-fg: #087f5b; --s-button-border-color: #087f5b; --s-button-border-width: 2px">Outline</s-button>
    <s-button size="lg" style="--s-button-height: 3.5rem; --s-button-font-weight: 700; --s-button-padding-x: 2rem">Tall</s-button>
  </div>`,
};

export const InForm: Story = {
  render: () => html`<form
    style="display: flex; gap: 12px"
    @submit=${(e: SubmitEvent) => {
      e.preventDefault();
      (e.target as HTMLFormElement).dataset.submitted = 'true';
    }}
  >
    <s-button type="submit">Submit</s-button>
    <s-button type="reset" variant="secondary">Reset</s-button>
  </form>`,
};
