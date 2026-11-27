import { devNode } from './dev';
import { createComponent, insert, setProp, use } from './dom';
import { createRenderEffect } from './reactivity';

type Brand = '~props';

export namespace JSX {
  export type Element =
    | Node
    | ArrayElement
    | (() => Element)
    | string
    | number
    | bigint
    | boolean
    | null
    | undefined;

  export interface ArrayElement extends Array<Element> {}

  export interface ElementChildrenAttribute {
    children: {};
  }

  export interface IntrinsicAttributes {}

  export interface HTMLAttributes {
    [attr: string]: unknown;
    children?: unknown;
    ref?: unknown;
    class?: unknown;
    className?: unknown;
    style?: string | Record<string, string | number | null | undefined> | (() => unknown);
    'xlink:href'?: unknown;
    'xlink:title'?: unknown;
    'xml:lang'?: unknown;
    'xml:space'?: unknown;
    'xmlns:xlink'?: unknown;
  }

  export interface IntrinsicElements {
    [tag: string]: HTMLAttributes;
  }

  export type LibraryManagedAttributes<_C, P> = Brand extends keyof P
    ? NonNullable<P[Brand & keyof P]> & { children?: unknown }
    : P;
}

/** Runtime for JSX that skipped the compiler. Compiled code never imports it. */
export function jsx(type: unknown, props: Record<string, unknown>): JSX.Element {
  if (typeof type === 'function') return createComponent(type as (p: unknown) => JSX.Element, props);
  const el = document.createElement(type as string);
  devNode?.(el);
  for (const k in props) {
    const v = props[k];
    if (k === 'children') insert(el, v, null);
    else if (k === 'ref') use(v as (el: Element) => void, el);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (typeof v === 'function') createRenderEffect(() => setProp(el, k, (v as () => unknown)()));
    else setProp(el, k, v);
  }
  return el;
}

export const jsxs = jsx;

export function Fragment(props: { children?: JSX.Element }): JSX.Element {
  return props.children;
}
