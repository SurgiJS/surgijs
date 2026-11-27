/** React DevTools hooks. Null until `@surgijs/core/devtools` installs them. */

export type DevRender = (
  host: HTMLElement,
  type: (props: object, host: HTMLElement) => unknown,
  props: object,
  run: () => unknown,
) => unknown;

export let devRender: DevRender | null = null;

export let devUnmount: ((host: Node) => void) | null = null;

export let devComponent: (<P, R>(type: (props: P) => R, props: P, run: () => R) => R) | null = null;

export let devNode: ((node: Node) => void) | null = null;

export function setDevRender(fn: DevRender | null): void {
  devRender = fn;
}

export function setDevUnmount(fn: ((host: Node) => void) | null): void {
  devUnmount = fn;
}

export function setDevComponent(fn: typeof devComponent): void {
  devComponent = fn;
}

export function setDevNode(fn: ((node: Node) => void) | null): void {
  devNode = fn;
}
