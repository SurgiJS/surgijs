// Compile-time checks for the React, Vue and Angular typings. Typecheck only: vitest does not run this file.
import type * as React from 'react';
import type { GlobalComponents } from 'vue';
import '../src/react';
import '../src/vue';
import type { SButtonDirective } from '../src/angular';

type ReactButton = React.JSX.IntrinsicElements['s-button'];
type VueButton = InstanceType<GlobalComponents['SButton']>['$props'];

export const reactValid: ReactButton = {
  variant: 'danger',
  size: 'sm',
  type: 'submit',
  disabled: true,
  label: 'Close',
  className: 'toolbar-button',
  onClick: () => {},
  ref: null,
};

// @ts-expect-error `tertiary` is not a button variant
export const reactUnknownVariant: ReactButton = { variant: 'tertiary' };

// @ts-expect-error `size` takes sm, md or lg
export const reactUnknownSize: ReactButton = { size: 'xl' };

export const vueValid: VueButton = { variant: 'ghost', loading: true, label: 'Save' };

// @ts-expect-error `tertiary` is not a button variant
export const vueUnknownVariant: VueButton = { variant: 'tertiary' };

export const angularValid = (d: SButtonDirective) => {
  d.variant = 'ghost';
  d.loading = true;
  d.label = 'Save';
};

// @ts-expect-error `tertiary` is not a button variant
export const angularUnknownVariant = (d: SButtonDirective) => (d.variant = 'tertiary');
