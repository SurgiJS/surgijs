export type Accessor<T> = () => T;
export type Setter<T> = <U extends T>(value: U | ((prev: T) => U)) => U;
export type Signal<T> = [get: Accessor<T>, set: Setter<T>];

/** Reactive value: `v` holds the value, `o` the observers. */
export interface Source {
  v: unknown;
  o: Observer[] | null;
}

type Cleanup = (() => void) | Disposable;
type Disposable = OwnerNode | Computation | Bound;

/** Owner: `c` cleanups and owned nodes, `p` parent, `k` context, `e` error handler. */
export interface OwnerNode {
  c: Cleanup[] | null;
  p: OwnerNode | null;
  k: Record<symbol, unknown> | null;
  e?: ((err: unknown) => void) | undefined;
}

/** `t`: 0 memo, 1 render effect, 2 user effect. `st`: 0 clean, 1 check, 2 dirty, -1 disposed. */
interface Computation extends OwnerNode, Source {
  st: number;
  t: 0 | 1 | 2;
  f: (prev: any) => any;
  s: Source[] | null;
}

/** Binding with fixed sources: `n` node, `r` reader, `a` apply, `x` reader arguments. */
interface Bound {
  st: number;
  t: 3;
  n: unknown;
  r: (...args: any[]) => unknown;
  a: (node: any, value: any) => unknown;
  x: unknown[] | undefined;
  s: Source | Source[];
  v: unknown;
}

type Observer = Computation | Bound;

let Owner: OwnerNode | null = null;
let Listener: Computation | null = null;
let Collect: Source[] | null = null;
let Index = 0;
let Fresh: Source[] | null = null;
let Deferred: Computation[] | null = null;
let scheduled = false;
let flushing = false;
let depth = 0;

const Pure: Observer[] = [];
const Render: Observer[] = [];
const Effects: Observer[] = [];

function track(s: Source): void {
  if (Collect) {
    if (Collect[Collect.length - 1] !== s) Collect.push(s);
    return;
  }
  const l = Listener;
  if (!l) return;
  if (Fresh) Fresh.push(s);
  else if (l.s && l.s[Index] === s) Index++;
  else Fresh = [s];
}

function link(s: Source, o: Observer): void {
  if (s.o) s.o.push(o);
  else s.o = [o];
}

function unlink(s: Source, o: Observer): void {
  const list = s.o;
  if (!list) return;
  const i = list.lastIndexOf(o);
  if (i < 0) return;
  const last = list.pop()!;
  if (i < list.length) list[i] = last;
}

function mark(o: Observer, st: number): void {
  const was = o.st;
  if (was >= st || was < 0) return;
  o.st = st;
  if (was !== 0) return;
  if (o.t === 0) {
    Pure.push(o);
    const list = o.o;
    if (list) for (let i = 0; i < list.length; i++) mark(list[i]!, 1);
  } else (o.t === 2 ? Effects : Render).push(o);
}

function schedule(): void {
  if (scheduled || flushing) return;
  scheduled = true;
  queueMicrotask(flush);
}

function write(s: Source, v: unknown): void {
  if (Object.is(s.v, v)) return;
  s.v = v;
  const list = s.o;
  if (!list) return;
  for (let i = 0; i < list.length; i++) mark(list[i]!, 2);
  if (!depth) schedule();
}

function cleanup(o: OwnerNode): void {
  const list = o.c;
  if (!list) return;
  o.c = null;
  for (let i = list.length - 1; i >= 0; i--) {
    const x = list[i]!;
    if (typeof x === 'function') x();
    else disposeNode(x);
  }
}

function disposeNode(x: Disposable): void {
  if ('t' in x) {
    if (x.st < 0) return;
    if (x.t === 3) return disposeBound(x);
    x.st = -1;
  }
  cleanup(x);
  const s = (x as Computation).s;
  if (s) {
    for (let i = 0; i < s.length; i++) unlink(s[i]!, x as Computation);
    (x as Computation).s = null;
  }
}

function own(x: Disposable): void {
  if (Owner) (Owner.c ||= []).push(x);
}

function recover(o: OwnerNode | null, err: unknown): void {
  for (; o; o = o.p) if (o.e) return o.e(err);
  throw err;
}

function update(c: Computation): void {
  cleanup(c);
  const prevOwner = Owner;
  const prevListener = Listener;
  const prevCollect = Collect;
  const prevIndex = Index;
  const prevFresh = Fresh;
  Owner = Listener = c;
  Collect = Fresh = null;
  Index = 0;
  c.st = 0;
  let v: unknown;
  let failed = false;
  let error: unknown;
  try {
    v = c.f(c.v);
  } catch (err) {
    failed = true;
    error = err;
  }
  const s = c.s;
  if (Fresh) {
    const fresh: Source[] = Fresh;
    if (s) {
      for (let i = Index; i < s.length; i++) unlink(s[i]!, c);
      s.length = Index;
      for (let i = 0; i < fresh.length; i++) s.push(fresh[i]!);
    } else c.s = fresh;
    for (let i = 0; i < fresh.length; i++) link(fresh[i]!, c);
  } else if (s && Index < s.length) {
    for (let i = Index; i < s.length; i++) unlink(s[i]!, c);
    s.length = Index;
  }
  Owner = prevOwner;
  Listener = prevListener;
  Collect = prevCollect;
  Index = prevIndex;
  Fresh = prevFresh;
  if (failed) return recover(c.p, error);
  if (c.t === 0) {
    if (Object.is(v, c.v)) return;
    c.v = v;
    const list = c.o;
    if (list) for (let i = 0; i < list.length; i++) mark(list[i]!, 2);
  } else c.v = v;
}

function runBound(b: Bound): void {
  b.st = 0;
  const x = b.x;
  const v = x ? (x.length === 1 ? b.r(x[0]) : x.length === 2 ? b.r(x[0], x[1]) : b.r(...x)) : b.r();
  if (Object.is(v, b.v)) return;
  b.v = v;
  b.a(b.n, v);
}

function disposeBound(b: Bound): void {
  b.st = -1;
  const s = b.s;
  if (Array.isArray(s)) for (let i = 0; i < s.length; i++) unlink(s[i]!, b);
  else unlink(s, b);
}

function stale(s: Source): void {
  const c = s as Computation;
  if (c.t === 0 && c.st > 0) refresh(c);
}

function refresh(o: Observer): void {
  if (o.st === 1) {
    const s = o.s;
    if (Array.isArray(s)) {
      for (let i = 0; i < s.length && o.st === 1; i++) stale(s[i]!);
    } else if (s) stale(s);
    if (o.st === 1) o.st = 0;
  }
  if (o.st === 2) {
    if (o.t === 3) runBound(o);
    else update(o);
  }
}

function drain(q: Observer[]): unknown[] | null {
  let errors: unknown[] | null = null;
  for (let i = 0; i < q.length; i++) {
    try {
      refresh(q[i]!);
    } catch (err) {
      (errors ||= []).push(err);
    }
  }
  q.length = 0;
  return errors;
}

/** Runs every pending computation synchronously. Writes schedule this in a microtask. */
export function flush(): void {
  if (flushing) return;
  flushing = true;
  scheduled = false;
  let errors: unknown[] | null = null;
  try {
    for (let guard = 0; Pure.length || Render.length || Effects.length; guard++) {
      if (guard > 100000) throw new Error('SurgiJS: update loop does not settle');
      const e = drain(Pure.length ? Pure : Render.length ? Render : Effects);
      if (e) (errors ||= []).push(...e);
    }
  } finally {
    flushing = false;
  }
  if (errors) throw errors[0];
}

function computation(f: (prev: any) => any, v: unknown, t: 0 | 1 | 2): Computation {
  const c: Computation = { c: null, p: Owner, k: Owner ? Owner.k : null, st: 0, t, f, v, s: null, o: null };
  own(c);
  return c;
}

export function createSignal<T>(): Signal<T | undefined>;
export function createSignal<T>(value: T): Signal<T>;
export function createSignal<T>(value?: T): Signal<T | undefined> {
  const s: Source = { v: value, o: null };
  return [
    () => {
      if (Listener || Collect) track(s);
      return s.v as T;
    },
    ((next: unknown) => {
      if (typeof next === 'function') next = (next as (prev: unknown) => unknown)(s.v);
      write(s, next);
      return next;
    }) as Setter<T | undefined>,
  ];
}

export function createMemo<T>(fn: (prev: T | undefined) => T, init?: T): Accessor<T> {
  const c = computation(fn, init, 0);
  update(c);
  return () => {
    if (c.st > 0) refresh(c);
    if (Listener || Collect) track(c);
    return c.v as T;
  };
}

/** Runs `fn` now and again before paint-phase effects whenever a dependency changes. */
export function createRenderEffect<T>(fn: (prev: T | undefined) => T, init?: T): void {
  update(computation(fn, init, 1));
}

/** Runs `fn` after the current render (or the enclosing `deferMount`) and on every change. */
export function createEffect<T>(fn: (prev: T | undefined) => T, init?: T): void {
  const c = computation(fn, init, 2);
  c.st = 2;
  if (Deferred) Deferred.push(c);
  else {
    Effects.push(c);
    schedule();
  }
}

export const effect = createRenderEffect;

/** Creates a detached owner. `fn` receives the dispose function. */
export function createRoot<T>(fn: (dispose: () => void) => T, owner: OwnerNode | null = Owner): T {
  const root: OwnerNode = { c: null, p: owner, k: owner ? owner.k : null };
  const prevOwner = Owner;
  const prevListener = Listener;
  const prevCollect = Collect;
  Owner = root;
  Listener = null;
  Collect = null;
  try {
    return fn(() => disposeNode(root));
  } finally {
    Owner = prevOwner;
    Listener = prevListener;
    Collect = prevCollect;
  }
}

export function getOwner(): OwnerNode | null {
  return Owner;
}

export function runWithOwner<T>(owner: OwnerNode | null, fn: () => T): T {
  const prev = Owner;
  Owner = owner;
  try {
    return fn();
  } finally {
    Owner = prev;
  }
}

export function onCleanup<T extends () => void>(fn: T): T {
  if (Owner) (Owner.c ||= []).push(fn);
  return fn;
}

export function onMount(fn: () => void): void {
  createEffect(() => untrack(fn));
}

export function untrack<T>(fn: () => T): T {
  const prevListener = Listener;
  const prevCollect = Collect;
  Listener = null;
  Collect = null;
  try {
    return fn();
  } finally {
    Listener = prevListener;
    Collect = prevCollect;
  }
}

/** Groups writes and flushes once when the outermost batch ends. */
export function batch<T>(fn: () => T): T {
  depth++;
  try {
    return fn();
  } finally {
    if (--depth === 0) flush();
  }
}

/** Holds back the first run of effects created inside `fn` until `fn` returns. */
export function deferMount<T>(fn: () => T): T {
  const prev = Deferred;
  const list: Computation[] = (Deferred = []);
  try {
    return fn();
  } finally {
    Deferred = prev;
    for (let i = 0; i < list.length; i++) {
      const c = list[i]!;
      if (c.st === 2) update(c);
    }
  }
}

/**
 * Applies `apply(node, read(...args))` now and on every change of the sources read
 * during the first call. The compiler emits it for reads that happen on every run.
 */
export function bind<N, V>(node: N, read: (...args: any[]) => V, apply: (node: N, value: V) => unknown, ...args: unknown[]): void {
  const prevCollect = Collect;
  const prevListener = Listener;
  const sources: Source[] = (Collect = []);
  Listener = null;
  const x = args.length ? args : undefined;
  let v: V;
  try {
    v = x ? read(...x) : read();
  } finally {
    Collect = prevCollect;
    Listener = prevListener;
  }
  apply(node, v);
  const n = sources.length;
  if (!n) return;
  const b: Bound = { st: 0, t: 3, n: node, r: read, a: apply as Bound['a'], x, s: n === 1 ? sources[0]! : sources, v };
  for (let i = 0; i < n; i++) link(sources[i]!, b);
  own(b);
}

/** Passes `err` to the nearest error handler above `owner`, or throws it. */
export function handleError(owner: OwnerNode | null, err: unknown): void {
  recover(owner, err);
}
