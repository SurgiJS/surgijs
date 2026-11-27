/** React DevTools hooks. Null until `@surgijs/core/devtools` installs them. */

export let devRender: ((host: HTMLElement, render: (props: any, host: HTMLElement, emit: any) => unknown, props: object, emit: unknown) => unknown) | null = null;

export let devUnmount: ((host: Node) => void) | null = null;

export let devComponent: (<P, R>(fn: (props: P) => R, props: P) => R) | null = null;

export let devNode: ((node: Node) => void) | null = null;

export function setDevRender(fn: typeof devRender): void {
  devRender = fn;
}

export function setDevUnmount(fn: typeof devUnmount): void {
  devUnmount = fn;
}

export function setDevComponent(fn: typeof devComponent): void {
  devComponent = fn;
}

export function setDevNode(fn: typeof devNode): void {
  devNode = fn;
}
