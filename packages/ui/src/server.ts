import { renderToString } from '@surgijs/core/server';
import * as button from './button/button.view.tsx?ssr';
import type { ButtonProps } from './button/button.view';

/**
 * Server HTML for `<s-button>`: the host with its attributes, a declarative shadow root
 * and `children` (trusted HTML, not escaped) as slotted light DOM. Hydrates on the client
 * with `enableHydration()` from `@surgijs/core/hydrate`.
 */
export function renderButton(props: ButtonProps = {}, children = ''): string {
  return renderToString('s-button', button.Button!, props as Record<string, unknown>, { children, delegatesFocus: true });
}
