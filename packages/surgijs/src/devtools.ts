import { setDevComponent, setDevNode, setDevRender, setDevUnmount } from './dev';
import { setDevHook } from './hooks';
import { setDevFlush, setDevOwn, setDevRun, untrack, type OwnerNode } from './reactivity';

const FunctionComponent = 0;
const HostRoot = 3;
const HostComponent = 5;

interface HookRec {
  kind: string;
  read: () => unknown;
}

interface DevHook {
  memoizedState: unknown;
  baseState: unknown;
  baseQueue: null;
  queue: null;
  next: DevHook | null;
}

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
  deletions: Fiber[] | null;
  lanes: number;
  childLanes: number;
  alternate: Fiber | null;
  actualDuration: number;
  actualStartTime: number;
  selfBaseDuration: number;
  treeBaseDuration: number;
  _debugSource: null;
  _debugOwner: Fiber | null;
  _debugHookTypes: string[] | null;
  props: object | null;
  hooks: HookRec[];
  kids: Fiber[];
  cursor: number;
  root: DevRoot;
}

interface DevRoot {
  current: Fiber;
  containerInfo: Node;
  pendingChildren: null;
  tag: number;
  memoizedUpdaters: Set<Fiber>;
}

interface HookApi {
  isDisabled?: boolean;
  supportsFiber?: boolean;
  inject: (renderer: object) => number;
  onCommitFiberRoot: (id: number, root: DevRoot, priority: number, didError: boolean) => void;
  onCommitFiberUnmount: (id: number, fiber: Fiber) => void;
}

let api: HookApi | null = null;
let rendererID = 0;
let installed = false;
let current: Fiber | null = null;
let peeking = false;
let painting = false;
const roots = new Set<DevRoot>();
const byNode = new WeakMap<Node, Fiber>();
const owners = new WeakMap<OwnerNode, Fiber>();
const stack: { prev: Fiber | null; fiber: Fiber | null; pass: boolean }[] = [];

function makeFiber(tag: number, type: unknown, parent: Fiber | null): Fiber {
  return {
    tag,
    key: null,
    elementType: type,
    type,
    stateNode: null,
    return: parent,
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
    _debugSource: null,
    _debugOwner: parent,
    _debugHookTypes: null,
    props: null,
    hooks: [],
    kids: [],
    cursor: 0,
    root: parent ? parent.root : (undefined as unknown as DevRoot),
  };
}

/** Reads accessor props once. Skips `children` so a child render is not run again. */
function readProps(props: object): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const prev = peeking;
  peeking = true;
  try {
    untrack(() => {
      for (const key in props) {
        if (key === 'children' || key === '~props') continue;
        const value = (props as Record<string, unknown>)[key];
        if (typeof value === 'function' && value.length === 0) {
          try {
            const next = (value as () => unknown)();
            if (typeof next !== 'function') out[key] = next;
          } catch {
            /* getter threw */
          }
        } else if (typeof value !== 'function') out[key] = value;
      }
    });
  } finally {
    peeking = prev;
  }
  return out;
}

function applyHooks(fiber: Fiber): void {
  if (fiber.tag !== FunctionComponent) return;
  const list = fiber.hooks;
  if (!list.length) {
    fiber.memoizedState = null;
    fiber._debugHookTypes = null;
    return;
  }
  const types: string[] = [];
  let head: DevHook | null = null;
  let prev: DevHook | null = null;
  for (const hook of list) {
    types.push(hook.kind);
    let value: unknown;
    try {
      value = untrack(hook.read);
    } catch {
      value = undefined;
    }
    const node: DevHook = { memoizedState: value, baseState: value, baseQueue: null, queue: null, next: null };
    if (prev) prev.next = node;
    else head = node;
    prev = node;
  }
  fiber.memoizedState = head;
  fiber._debugHookTypes = types;
}

function unmount(fiber: Fiber): void {
  let child = fiber.child;
  while (child) {
    const next = child.sibling;
    unmount(child);
    child = next;
  }
  try {
    api?.onCommitFiberUnmount(rendererID, fiber);
  } catch {
    /* extension */
  }
}

function link(parent: Fiber): void {
  const removed = parent.kids.splice(parent.cursor);
  parent.deletions = removed.length ? removed : null;
  for (const fiber of removed) unmount(fiber);
  let prev: Fiber | null = null;
  parent.child = parent.kids[0] ?? null;
  for (const kid of parent.kids) {
    kid.sibling = null;
    kid.return = parent;
    if (prev) prev.sibling = kid;
    prev = kid;
  }
}

function commit(root: DevRoot): void {
  try {
    api?.onCommitFiberRoot(rendererID, root, 0, false);
  } catch {
    /* extension */
  }
  remember(root.current);
}

/** Points `alternate` at the tree DevTools just saw, so the next commit is an update. */
function remember(fiber: Fiber | null): void {
  while (fiber) {
    const alt = fiber.alternate ?? (fiber.alternate = makeFiber(fiber.tag, fiber.type, fiber.return));
    alt.memoizedProps = fiber.memoizedProps;
    alt.pendingProps = fiber.pendingProps;
    alt.memoizedState = fiber.memoizedState;
    alt.child = fiber.child;
    alt.sibling = fiber.sibling;
    alt.stateNode = fiber.stateNode;
    alt._debugHookTypes = fiber._debugHookTypes;
    alt.alternate = fiber;
    remember(fiber.child);
    fiber = fiber.sibling;
  }
}

function place(parent: Fiber, type: unknown, props: object): Fiber {
  const index = parent.cursor++;
  let fiber = parent.kids[index];
  if (!fiber || fiber.type !== type) {
    if (fiber) unmount(fiber);
    fiber = makeFiber(FunctionComponent, type, parent);
    fiber.root = parent.root;
    parent.kids[index] = fiber;
  }
  fiber.props = props;
  fiber.pendingProps = fiber.memoizedProps = readProps(props);
  fiber.hooks = [];
  fiber.return = parent;
  fiber.index = index;
  fiber._debugOwner = parent;
  return fiber;
}

function refresh(fiber: Fiber | null): void {
  while (fiber) {
    if (fiber.tag === FunctionComponent && fiber.props) {
      const next = readProps(fiber.props);
      fiber.pendingProps = next;
      fiber.memoizedProps = next;
      applyHooks(fiber);
    }
    refresh(fiber.child);
    fiber = fiber.sibling;
  }
}

function devRender(host: HTMLElement, type: (props: object, host: HTMLElement) => unknown, props: object, run: () => unknown): unknown {
  const rootFiber = makeFiber(HostRoot, null, null);
  const root: DevRoot = {
    current: rootFiber,
    containerInfo: host,
    pendingChildren: null,
    tag: 1,
    memoizedUpdaters: new Set(),
  };
  rootFiber.root = root;
  rootFiber.stateNode = root;
  rootFiber.memoizedState = { element: type };

  const hostFiber = makeFiber(HostComponent, host.localName, rootFiber);
  hostFiber.root = root;
  hostFiber.stateNode = host;
  rootFiber.child = hostFiber;
  rootFiber.kids = [hostFiber];
  rootFiber.cursor = 1;

  const comp = makeFiber(FunctionComponent, type, hostFiber);
  comp.root = root;
  comp.props = props;
  comp.pendingProps = comp.memoizedProps = readProps(props);
  comp.stateNode = host;
  hostFiber.child = comp;
  hostFiber.kids = [comp];
  hostFiber.cursor = 1;

  byNode.set(host, comp);
  roots.add(root);
  const prev = current;
  current = comp;
  try {
    return run();
  } finally {
    link(comp);
    applyHooks(comp);
    current = prev;
    commit(root);
  }
}

function devComponent<P, R>(type: (props: P) => R, props: P, run: () => R): R {
  if (peeking || !current) return run();
  const fiber = place(current, type, props as object);
  const prev = current;
  current = fiber;
  try {
    return run();
  } finally {
    link(fiber);
    applyHooks(fiber);
    current = prev;
  }
}

function onRun(owner: OwnerNode | null): void {
  if (!owner) {
    const frame = stack.pop();
    if (!frame) return;
    if (frame.pass && frame.fiber) {
      link(frame.fiber);
      applyHooks(frame.fiber);
    }
    current = frame.prev;
    return;
  }
  const mapped = owners.get(owner) ?? null;
  const pass = mapped != null && mapped !== current;
  if (pass && mapped) {
    stack.push({ prev: current, fiber: mapped, pass: true });
    mapped.cursor = 0;
    current = mapped;
    return;
  }
  stack.push({ prev: current, fiber: null, pass: false });
}

function onOwn(owner: OwnerNode): void {
  if (peeking || !current || typeof current.type !== 'function') return;
  const name = current.type.name;
  // shortcut: only For/Show/Switch re-sync children after the first render. Other memos (and ErrorBoundary reset) keep the first tree until the element reconnects.
  if (name !== 'For' && name !== 'Show' && name !== 'Switch') return;
  owners.set(owner, current);
}

function onNode(node: Node): void {
  if (!current || peeking || node.nodeType !== 1) return;
  const el = node as Element;
  byNode.set(el, current);
  const all = el.querySelectorAll('*');
  for (let i = 0; i < all.length; i++) byNode.set(all[i]!, current);
}

function onUnmount(host: Node): void {
  const comp = byNode.get(host);
  if (!comp) return;
  const root = comp.root;
  if (root.current.child) unmount(root.current.child);
  root.current.memoizedState = { element: null };
  root.current.child = null;
  commit(root);
  roots.delete(root);
  byNode.delete(host);
}

function onFlush(): void {
  if (painting || !roots.size) return;
  painting = true;
  try {
    for (const root of roots) {
      refresh(root.current);
      commit(root);
    }
  } finally {
    painting = false;
  }
}

function onHook(kind: string, read: () => unknown): void {
  if (peeking || !current) return;
  current.hooks.push({ kind, read });
}

function findFiberByHostInstance(node: Node): Fiber | null {
  let n: Node | null = node;
  while (n) {
    const fiber = byNode.get(n);
    if (fiber) return fiber;
    const next: Node | null = n.parentNode ?? (n.nodeType === 11 ? (n as ShadowRoot).host : null);
    n = next;
  }
  return null;
}

/** Registers the runtime with React DevTools when the extension is installed. */
export function installDevtools(): void {
  if (installed) return;
  const hook = (globalThis as { __REACT_DEVTOOLS_GLOBAL_HOOK__?: HookApi }).__REACT_DEVTOOLS_GLOBAL_HOOK__;
  if (!hook || hook.isDisabled || hook.supportsFiber === false || typeof hook.inject !== 'function') return;
  installed = true;
  api = hook;
  rendererID = hook.inject({
    bundleType: 1,
    version: '0.3.0',
    rendererPackageName: 'surgijs',
    reconcilerVersion: '0.3.0',
    findFiberByHostInstance,
    findHostInstanceByFiber(fiber: Fiber) {
      return fiber.stateNode instanceof Node ? fiber.stateNode : fiber.root.containerInfo;
    },
    getCurrentFiber: () => current,
  });
  setDevRender(devRender);
  setDevUnmount(onUnmount);
  setDevComponent(devComponent);
  setDevNode(onNode);
  setDevRun(onRun);
  setDevOwn(onOwn);
  setDevFlush(onFlush);
  setDevHook(onHook);
}

/** Drops the adapter. Tests use this so later files keep the production path. */
export function uninstallDevtools(): void {
  installed = false;
  api = null;
  current = null;
  stack.length = 0;
  roots.clear();
  setDevRender(null);
  setDevUnmount(null);
  setDevComponent(null);
  setDevNode(null);
  setDevRun(null);
  setDevOwn(null);
  setDevFlush(null);
  setDevHook(null);
}

installDevtools();
