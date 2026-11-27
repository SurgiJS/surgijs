import { setDevComponent, setDevNode, setDevRender, setDevUnmount } from './dev';
import { setDevHook } from './hooks';
import { getOwner, onCleanup, setDevFlush, setDevOwn, untrack, type OwnerNode } from './reactivity';

// Work tags of React 17+. Components are published as class fibers: DevTools then lists hook
// values under "state" instead of re-running the component to inspect React hooks.
const ClassComponent = 1;
const HostRoot = 3;
const HostComponent = 5;
const PerformedWork = 1;
const HANDLER = /^on[A-Z]/;

interface Fiber {
  tag: number;
  key: null;
  elementType: unknown;
  type: unknown;
  stateNode: unknown;
  return: Fiber | null;
  child: Fiber | null;
  sibling: Fiber | null;
  index: number;
  ref: null;
  pendingProps: unknown;
  memoizedProps: unknown;
  memoizedState: unknown;
  updateQueue: null;
  dependencies: null;
  mode: number;
  flags: number;
  subtreeFlags: number;
  deletions: null;
  lanes: number;
  childLanes: number;
  alternate: Fiber | null;
  actualDuration: number;
  actualStartTime: number;
  selfBaseDuration: number;
  treeBaseDuration: number;
  _debugOwner: null;
}

interface Root {
  current: Fiber | null;
  containerInfo: Node;
  pendingChildren: null;
  tag: number;
  memoizedUpdaters: Set<Fiber>;
  inst: Inst;
}

/** One rendered component or DOM node. `pub` is the fiber DevTools saw last; `spare` the one before. */
interface Inst {
  tag: number;
  type: unknown;
  node: Node | null;
  at: OwnerNode | null;
  parent: Inst | null;
  kids: Inst[];
  props: Record<string, unknown>;
  hooks: [kind: string, read: () => unknown][];
  rendering: boolean;
  root: Root;
  pub: Fiber | null;
  spare: Fiber | null;
}

interface HookApi {
  isDisabled?: boolean;
  supportsFiber?: boolean;
  inject: (renderer: object) => number;
  onCommitFiberRoot: (id: number, root: Root, priority?: number, didError?: boolean) => void;
  onCommitFiberUnmount?: (id: number, fiber: Fiber) => void;
}

let api: HookApi | null = null;
let rendererID = 0;
let current: Inst | null = null;
let scheduled = false;
const roots = new Set<Root>();
const pending = new Set<Root>();
const byHost = new WeakMap<Node, Root>();
const owners = new WeakMap<OwnerNode, Inst>();

function makeFiber(): Fiber {
  return {
    tag: 0,
    key: null,
    elementType: null,
    type: null,
    stateNode: null,
    return: null,
    child: null,
    sibling: null,
    index: 0,
    ref: null,
    pendingProps: null,
    memoizedProps: null,
    memoizedState: null,
    updateQueue: null,
    dependencies: null,
    mode: 0,
    flags: 0,
    subtreeFlags: 0,
    deletions: null,
    lanes: 0,
    childLanes: 0,
    alternate: null,
    actualDuration: 0,
    actualStartTime: 0,
    selfBaseDuration: 0,
    treeBaseDuration: 0,
    _debugOwner: null,
  };
}

function make(tag: number, type: unknown, parent: Inst | null, node: Node | null): Inst {
  const inst: Inst = {
    tag,
    type,
    node,
    at: null,
    parent,
    kids: [],
    props: {},
    hooks: [],
    rendering: false,
    root: parent ? parent.root : (null as unknown as Root),
    pub: null,
    spare: null,
  };
  if (parent) parent.kids.push(inst);
  return inst;
}

/** The component that owns work created now: the one rendering, or the one whose computation runs. */
function ownerInst(): Inst | null {
  for (let o = getOwner(); o; o = o.p) {
    if (current && o === current.at) return current;
    const inst = owners.get(o);
    if (inst) return inst;
  }
  return current;
}

function dirty(root: Root): void {
  pending.add(root);
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    for (const r of pending) if (roots.has(r)) commit(r);
    pending.clear();
  });
}

function note<T>(inst: Inst, key: string, value: T): T {
  if (!Object.is(inst.props[key], value)) {
    inst.props[key] = value;
    dirty(inst.root);
  }
  return value;
}

/** Copies `props`, recording each value when the component reads it. Nothing is called here. */
function watch(inst: Inst, props: object): object {
  const out = {};
  for (const key of Reflect.ownKeys(props)) {
    const d = Object.getOwnPropertyDescriptor(props, key)!;
    if (typeof key === 'string' && key !== 'children') {
      if (d.get) {
        const get = d.get;
        d.get = function (this: unknown) {
          return note(inst, key, get.call(this));
        };
      } else if (typeof d.value === 'function' && d.value.length === 0) {
        const fn = d.value as (...args: unknown[]) => unknown;
        inst.props[key] = fn;
        d.value = function (this: unknown, ...args: unknown[]) {
          const value = fn.apply(this, args);
          // A handler called without the compiler returns its own result: keep the function shown.
          return HANDLER.test(key) && typeof value !== 'function' ? value : note(inst, key, value);
        };
      } else inst.props[key] = d.value;
    }
    Object.defineProperty(out, key, d);
  }
  return out;
}

function render<T>(inst: Inst, fn: () => T): T {
  const prev = current;
  current = inst;
  inst.rendering = true;
  try {
    return fn();
  } finally {
    inst.rendering = false;
    current = prev;
    dirty(inst.root);
  }
}

function forget(inst: Inst): void {
  for (const kid of inst.kids) forget(kid);
  if (inst.pub)
    try {
      api?.onCommitFiberUnmount?.(rendererID, inst.pub);
    } catch {
      /* extension */
    }
}

function drop(inst: Inst): void {
  const kids = inst.parent?.kids;
  const i = kids ? kids.indexOf(inst) : -1;
  if (i < 0) return;
  kids!.splice(i, 1);
  forget(inst);
  dirty(inst.root);
}

function hookState(inst: Inst): Record<string, unknown> | null {
  if (!inst.hooks.length) return null;
  const out: Record<string, unknown> = {};
  const seen: Record<string, number> = {};
  for (const [kind, read] of inst.hooks) {
    const n = (seen[kind] = (seen[kind] ?? 0) + 1);
    let value: unknown;
    try {
      value = untrack(read);
    } catch (err) {
      value = err;
    }
    out[n > 1 ? `${kind} ${n}` : kind] = value;
  }
  return out;
}

function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => Object.is((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

/** Writes `inst` into its spare fiber, so the fiber DevTools holds from the last commit stays intact. */
function publish(inst: Inst, parent: Fiber | null, index: number): Fiber {
  const prev = inst.pub;
  const f = inst.spare ?? makeFiber();
  f.tag = inst.tag;
  f.type = f.elementType = inst.type;
  f.return = parent;
  f.sibling = null;
  f.index = index;
  f.alternate = prev;
  if (prev) prev.alternate = f;
  if (inst.tag === HostRoot) {
    f.stateNode = inst.root;
    f.memoizedProps = f.pendingProps = null;
    f.memoizedState = { element: inst.kids.length ? inst.kids[0]!.type : null };
  } else {
    f.stateNode = inst.node;
    f.memoizedProps = f.pendingProps = inst.tag === HostComponent ? {} : { ...inst.props };
    f.memoizedState = inst.tag === ClassComponent ? hookState(inst) : null;
  }
  f.flags = !prev || !same(prev.memoizedProps, f.memoizedProps) || !same(prev.memoizedState, f.memoizedState) ? PerformedWork : 0;
  let last: Fiber | null = null;
  f.child = null;
  inst.kids.forEach((kid, i) => {
    const child = publish(kid, f, i);
    if (last) last.sibling = child;
    else f.child = child;
    last = child;
  });
  inst.spare = prev;
  inst.pub = f;
  return f;
}

function commit(root: Root): void {
  root.current = publish(root.inst, null, 0);
  try {
    api?.onCommitFiberRoot(rendererID, root, undefined, false);
  } catch {
    /* extension */
  }
}

function onRender(host: HTMLElement, fn: (props: any, host: HTMLElement, emit: any) => unknown, props: object, emit: unknown): unknown {
  const top = make(HostRoot, null, null, null);
  const root: Root = { current: null, containerInfo: host, pendingChildren: null, tag: 1, memoizedUpdaters: new Set(), inst: top };
  top.root = root;
  const comp = make(ClassComponent, fn, make(HostComponent, host.localName, top, host), null);
  comp.at = getOwner();
  if (comp.at) owners.set(comp.at, comp);
  roots.add(root);
  byHost.set(host, root);
  const wrapped = watch(comp, props);
  return render(comp, () => fn(wrapped, host, emit));
}

function onComponent<P, R>(fn: (props: P) => R, props: P): R {
  const parent = ownerInst();
  if (!parent) return untrack(() => fn(props));
  const inst = make(ClassComponent, fn, parent, null);
  inst.at = getOwner();
  if (inst.at) onCleanup(() => drop(inst));
  const wrapped = watch(inst, props as object) as P;
  return render(inst, () => untrack(() => fn(wrapped)));
}

function onNode(node: Node): void {
  if (node.nodeType !== 1) return;
  const parent = ownerInst();
  if (!parent) return;
  const inst = make(HostComponent, (node as Element).localName, parent, node);
  if (getOwner()) onCleanup(() => drop(inst));
  dirty(parent.root);
}

function onOwn(owner: OwnerNode): void {
  if (current && owner.p === current.at) owners.set(owner, current);
}

function onHook(kind: string, read: () => unknown): void {
  if (current && current.rendering) current.hooks.push([kind, read]);
}

function onFlush(): void {
  for (const root of roots) dirty(root);
}

function onUnmount(host: Node): void {
  const root = byHost.get(host);
  if (!root) return;
  for (const kid of root.inst.kids) forget(kid);
  root.inst.kids = [];
  commit(root);
  roots.delete(root);
  byHost.delete(host);
}

function findFiberByHostInstance(node: Node): Fiber | null {
  for (let n: Node | null = node; n; n = n.parentNode ?? (n.nodeType === 11 ? (n as ShadowRoot).host : null)) {
    const root = byHost.get(n);
    if (root) return root.inst.kids[0]?.kids[0]?.pub ?? null;
  }
  return null;
}

/** Registers the runtime with React DevTools when the extension is installed. */
export function installDevtools(): void {
  if (api) return;
  const hook = (globalThis as { __REACT_DEVTOOLS_GLOBAL_HOOK__?: HookApi }).__REACT_DEVTOOLS_GLOBAL_HOOK__;
  if (!hook || hook.isDisabled || hook.supportsFiber === false || typeof hook.inject !== 'function') return;
  api = hook;
  rendererID = hook.inject({
    bundleType: 1,
    version: '0.3.0',
    rendererPackageName: '@surgijs/core',
    reconcilerVersion: '19.0.0',
    findFiberByHostInstance,
    findHostInstanceByFiber: (fiber: Fiber) => (fiber.stateNode instanceof Node ? fiber.stateNode : null),
    getCurrentFiber: () => current?.pub ?? null,
  });
  setDevRender(onRender);
  setDevUnmount(onUnmount);
  setDevComponent(onComponent);
  setDevNode(onNode);
  setDevOwn(onOwn);
  setDevFlush(onFlush);
  setDevHook(onHook);
}

/** Drops the adapter. Tests use this so later files keep the production path. */
export function uninstallDevtools(): void {
  api = null;
  current = null;
  roots.clear();
  pending.clear();
  setDevRender(null);
  setDevUnmount(null);
  setDevComponent(null);
  setDevNode(null);
  setDevOwn(null);
  setDevFlush(null);
  setDevHook(null);
}
