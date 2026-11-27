export {
  batch,
  createEffect,
  createMemo,
  createRenderEffect,
  createRoot,
  createSignal,
  deferMount,
  flush,
  getOwner,
  handleError,
  onCleanup,
  onMount,
  runWithOwner,
  untrack,
  type Accessor,
  type OwnerNode,
  type Setter,
  type Signal,
} from './reactivity';
export { createResource, useEffect, useId, useMemo, useRef, useState, type Deps, type Ref, type Resource } from './hooks';
export { createContext, useContext, type Context, type ProviderProps } from './context';
// Compiled JSX imports these helpers from here (compiled code is not type-checked, so the
// deprecation only steers hand-written code to `@surgijs/core/internal`).
export {
  /** @deprecated Compiler output helper. For hand-written integrations import it from `@surgijs/core/internal`. */
  attr,
  /** @deprecated Compiler output helper. For hand-written integrations import it from `@surgijs/core/internal`. */
  attrNS,
  /** @deprecated Compiler output helper. For hand-written integrations import it from `@surgijs/core/internal`. */
  className,
  /** @deprecated Compiler output helper. For hand-written integrations import it from `@surgijs/core/internal`. */
  createComponent,
  /** @deprecated Compiler output helper. For hand-written integrations import it from `@surgijs/core/internal`. */
  delegate,
  /** @deprecated Compiler output helper. For hand-written integrations import it from `@surgijs/core/internal`. */
  delegateRoot,
  /** @deprecated Compiler output helper. For hand-written integrations import it from `@surgijs/core/internal`. */
  diff,
  /** @deprecated Compiler output helper. For hand-written integrations import it from `@surgijs/core/internal`. */
  insert,
  /** @deprecated Compiler output helper. For hand-written integrations import it from `@surgijs/core/internal`. */
  setProp,
  /** @deprecated Compiler output helper. For hand-written integrations import it from `@surgijs/core/internal`. */
  setText,
  /** @deprecated Compiler output helper. For hand-written integrations import it from `@surgijs/core/internal`. */
  spread,
  /** @deprecated Compiler output helper. For hand-written integrations import it from `@surgijs/core/internal`. */
  style,
  /** @deprecated Compiler output helper. For hand-written integrations import it from `@surgijs/core/internal`. */
  template,
  /** @deprecated Compiler output helper. For hand-written integrations import it from `@surgijs/core/internal`. */
  toNodes,
  /** @deprecated Compiler output helper. For hand-written integrations import it from `@surgijs/core/internal`. */
  undelegateRoot,
  /** @deprecated Compiler output helper. For hand-written integrations import it from `@surgijs/core/internal`. */
  use,
} from './dom';
export {
  /** @deprecated Compiler output helper. For hand-written integrations import it from `@surgijs/core/internal`. */
  bind,
  /** @deprecated Compiler output helper. For hand-written integrations import it from `@surgijs/core/internal`. */
  effect,
} from './reactivity';
export { For, type ForProps } from './for';
export {
  ErrorBoundary,
  Match,
  Portal,
  Show,
  Switch,
  type ErrorBoundaryProps,
  type MatchProps,
  type PortalProps,
  type ShowProps,
  type SwitchProps,
} from './flow';
export {
  defineComponent,
  defineEvent,
  type ComponentClass,
  type ComponentOptions,
  type Emit,
  type EventDecl,
  type EventDecls,
  type EventOptions,
  type FormHost,
  type PropType,
  type ReactiveProps,
  type Schema,
} from './component';
export type { JSX } from './jsx-runtime';
