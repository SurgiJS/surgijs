export type Accessor<T> = () => T;
export type Setter<T> = <U extends T>(value: U | ((prev: T) => U)) => U;
export type Signal<T> = [get: Accessor<T>, set: Setter<T>];

/** Reactive value: `v` holds the value, `o` the observers. */
export interface Source {
  v: unknown;
  o: Observer | Observer[] | null;
}

/**
 * Queued work. `t` picks the queue: 0 memo, 1 render, 2 user effect. `st`: 0 idle, 1 queued, -1 disposed.
 * `h`: index hint into the longest observer list it joined, `-1` when unknown.
 */
interface Observer {
  st: number;
  t: number;
  h: number;
  run(): void;
  d(): void;
}

/** Binding owned through the `b` list of its owner. */
export interface Linked extends Observer {
  nx: Linked | null;
}

type Cleanup = (() => void) | Observer;

/**
 * Owner: `c` cleanups and owned computations, `b` owned bindings, `p` parent, `k` context,
 * `e` error handler.
 */
export interface OwnerNode {
  c: Cleanup[] | null;
  b?: Linked | null;
  p: OwnerNode | null;
  k: Record<symbol, unknown> | null;
  e?: ((err: unknown) => void) | undefined;
}

let Owner: OwnerNode | null = null;
let Listener: Comp | null = null;
/** Set while `bind` collects sources: the first goes to `First`; with more, `More` lists all of them. */
let Collect: true | null = null;
let First: Source | null = null;
let More: Source[] | null = null;
let Index = 0;
let Fresh: Source[] | null = null;
let Deferred: Comp[] | null = null;
let scheduled = false;
let running = false;
let depth = 0;
let Queues: Observer[][] = [[], [], []];

function track(s: Source): void {
  if (Collect) {
    if (!First) First = s;
    else if (!More) {
      if (s !== First) More = [First, s];
    } else if (More[More.length - 1] !== s) More.push(s);
  } else if (Fresh) Fresh.push(s);
  else if (Listener!.s && Listener!.s[Index] === s) Index++;
  else Fresh = [s];
}

function link(s: Source, o: Observer): void {
  const list = s.o;
  if (!list) s.o = o;
  else if (list instanceof Array) {
    const i = list.push(o) - 1;
    if (o.h < i) o.h = i;
  } else {
    s.o = [list, o];
    if (o.h < 1) o.h = 1;
  }
}

/** Removes `o` by swapping the last observer into its slot; the hint makes the lookup O(1). */
function unlink(s: Source, o: Observer): void {
  const list = s.o;
  if (list === o) s.o = null;
  else if (list instanceof Array) {
    let i = o.h;
    if (list[i] === o) o.h = -1;
    else if ((i = list.lastIndexOf(o)) < 0) return;
    const last = list.pop()!;
    if (i < list.length) {
      list[i] = last;
      if (last.h === list.length) last.h = i;
    }
  }
}

function notify(s: Source): void {
  const list = s.o;
  if (!list) return;
  if (list instanceof Array) for (let i = 0; i < list.length; i++) mark(list[i]!);
  else mark(list);
}

function mark(o: Observer): void {
  if (o.st) return;
  o.st = 1;
  Queues[o.t]!.push(o);
  if (!scheduled && !running && !depth) {
    scheduled = true;
    queueMicrotask(flush);
  }
}

/** Runs the cleanups of `o` and disposes what it owns. */
export function cleanup(o: OwnerNode): void {
  let b = o.b;
  if (b) {
    o.b = null;
    for (; b; b = b.nx) b.d();
  }
  const list = o.c;
  if (!list) return;
  o.c = null;
  for (let i = list.length; i--; ) {
    const x = list[i]!;
    if (typeof x === 'function') x();
    else x.d();
  }
}

function own(x: Observer): void {
  if (Owner) (Owner.c ||= []).push(x);
}

function recover(o: OwnerNode | null, err: unknown): void {
  for (; o; o = o.p) if (o.e) return o.e(err);
  throw err;
}

/** Drops every queued computation (they run again on their next change) and throws. */
function overflow(): never {
  for (const list of Queues) for (const o of list) if (o.st > 0) o.st = 0;
  Queues = [[], [], []];
  throw new Error('Infinite update loop');
}

/** Runs every queued computation now: memos first, then render effects, then effects. */
export function flush(): void {
  if (running) return;
  running = true;
  scheduled = false;
  let error: [unknown] | undefined;
  let rounds = 0;
  try {
    for (let i = 0; i < 3; ) {
      const q = Queues[i]!;
      if (!q.length) {
        i++;
        continue;
      }
      if (++rounds > 1e5) overflow();
      Queues[i] = [];
      for (const o of q) {
        if (o.st > 0) {
          try {
            o.run();
          } catch (err) {
            error ||= [err];
          }
        }
      }
      i = 0;
    }
  } finally {
    running = false;
  }
  if (error) throw error[0];
}

class Comp implements OwnerNode, Source, Observer {
  c: Cleanup[] | null = null;
  b: Linked | null = null;
  p: OwnerNode | null = Owner;
  k: Record<symbol, unknown> | null = Owner ? Owner.k : null;
  st = 0;
  h = -1;
  s: Source[] | null = null;
  o: Observer | Observer[] | null = null;
  f: (prev: any) => any;
  v: unknown;
  t: number;

  constructor(f: (prev: any) => any, v: unknown, t: number) {
    this.f = f;
    this.v = v;
    this.t = t;
    own(this);
  }

  run(): void {
    cleanup(this);
    const prevOwner = Owner;
    const prevListener = Listener;
    const prevCollect = Collect;
    const prevIndex = Index;
    const prevFresh = Fresh;
    Owner = Listener = this;
    Collect = Fresh = null;
    Index = 0;
    this.st = 0;
    let v: unknown;
    let error: [unknown] | undefined;
    try {
      v = this.f(this.v);
    } catch (err) {
      error = [err];
    }
    const s = this.s;
    if (s) {
      for (let i = Index; i < s.length; i++) unlink(s[i]!, this);
      s.length = Index;
    }
    const fresh = this.st < 0 ? null : (Fresh as typeof prevFresh);
    if (fresh) {
      for (const x of fresh) link(x, this);
      if (s) s.push(...fresh);
      else this.s = fresh;
    }
    Owner = prevOwner;
    Listener = prevListener;
    Collect = prevCollect;
    Index = prevIndex;
    Fresh = prevFresh;
    if (error) return recover(this.p, error[0]);
    if (this.t) this.v = v;
    else if (!Object.is(v, this.v)) {
      this.v = v;
      notify(this);
    }
  }

  d(): void {
    if (this.st < 0) return;
    this.st = -1;
    cleanup(this);
    if (this.s) for (const x of this.s) unlink(x, this);
    this.s = null;
  }
}

/** Sources read by the last `gather` call: one source, a list, or `null`. */
let Got: Source | Source[] | null = null;

/** Calls `read(arg)` untracked by the current listener and records its sources in `Got`. */
function gather(read: (arg: any) => unknown, arg: unknown): unknown {
  const prevCollect = Collect;
  const prevFirst = First;
  const prevMore = More;
  const prevListener = Listener;
  Collect = true;
  First = More = Listener = null;
  try {
    return read(arg);
  } finally {
    Got = More || First;
    Collect = prevCollect;
    First = prevFirst;
    More = prevMore;
    Listener = prevListener;
  }
}

type Sources = Source | Source[] | null;

const same = (a: Sources, b: Sources): boolean =>
  a === b || (a instanceof Array && b instanceof Array && a.length === b.length && a.every((x, i) => x === b[i]));

function each(s: Sources, fn: (s: Source, o: Observer) => void, o: Observer): void {
  if (s instanceof Array) for (const x of s) fn(x, o);
  else if (s) fn(s, o);
}

type Reader = (arg: unknown) => unknown;
type Apply = (node: unknown, value: unknown) => unknown;

/**
 * Binding: `n` node, `r` reader, `a` apply, `x` reader argument, `s` sources of the last read,
 * `p` owner that receives its errors.
 */
const Bound = /* @__PURE__ */ (() => {
  class Bound implements Linked {
    declare t: number;
    st = 0;
    h = -1;
    nx: Linked | null = null;
    p: OwnerNode | null = Owner;
    n: unknown;
    r: Reader;
    a: Apply;
    x: unknown;
    s: Sources;
    v: unknown;

    constructor(n: unknown, r: Reader, a: Apply, x: unknown, s: Sources, v: unknown) {
      this.n = n;
      this.r = r;
      this.a = a;
      this.x = x;
      this.s = s;
      this.v = v;
    }

    run(): void {
      this.st = 0;
      try {
        const v = gather(this.r, this.x);
        const s = Got;
        if (!same(s, this.s)) {
          each(this.s, unlink, this);
          each((this.s = s), link, this);
        }
        if (!Object.is(v, this.v)) this.a(this.n, (this.v = v));
      } catch (err) {
        recover(this.p, err);
      }
    }

    d(): void {
      this.st = -1;
      each(this.s, unlink, this);
      this.s = null;
    }
  }
  Bound.prototype.t = 1;
  return Bound;
})();

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
      if (!Object.is(s.v, next)) {
        s.v = next;
        notify(s);
      }
      return next;
    }) as Setter<T | undefined>,
  ];
}

export function createMemo<T>(fn: (prev: T | undefined) => T, init?: T): Accessor<T> {
  const c = new Comp(fn, init, 0);
  c.run();
  return () => {
    if (c.st > 0) c.run();
    if (Listener || Collect) track(c);
    return c.v as T;
  };
}

/** Runs `fn` now and again, before effects, whenever a dependency changes. */
export function createRenderEffect<T>(fn: (prev: T | undefined) => T, init?: T): void {
  new Comp(fn, init, 1).run();
}

/** Runs `fn` after the current render (or the enclosing `deferMount`) and on every change. */
export function createEffect<T>(fn: (prev: T | undefined) => T, init?: T): void {
  const c = new Comp(fn, init, 2);
  if (Deferred) Deferred.push(c);
  else mark(c);
}

export { createRenderEffect as effect };

/** Creates a detached owner. `fn` receives the dispose function. */
export function createRoot<T>(fn: (dispose: () => void) => T, owner: OwnerNode | null = Owner): T {
  const root: OwnerNode = { c: null, b: null, p: owner, k: owner ? owner.k : null };
  const prevOwner = Owner;
  const prevListener = Listener;
  const prevCollect = Collect;
  Owner = root;
  Listener = Collect = null;
  try {
    return fn(() => cleanup(root));
  } finally {
    Owner = prevOwner;
    Listener = prevListener;
    Collect = prevCollect;
  }
}

export function getOwner(): OwnerNode | null {
  return Owner;
}

/** Calls `fn(owner, a, b)` with `owner` as the current owner. */
export function runOwned<O extends OwnerNode | null, T, A, B>(owner: O, fn: (owner: O, a: A, b: B) => T, a: A, b: B): T {
  const prev = Owner;
  Owner = owner;
  try {
    return fn(owner, a, b);
  } finally {
    Owner = prev;
  }
}

export function runWithOwner<T>(owner: OwnerNode | null, fn: () => T): T {
  return runOwned(owner as OwnerNode, fn, 0, 0);
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
  Listener = Collect = null;
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
    if (!--depth) flush();
  }
}

/** Holds back the first run of effects created inside `fn` until `fn` returns. */
export function deferMount<T>(fn: () => T): T {
  const prev = Deferred;
  const list: Comp[] = (Deferred = []);
  try {
    return fn();
  } finally {
    Deferred = prev;
    let error: [unknown] | undefined;
    for (const c of list) {
      if (!c.st) {
        try {
          c.run();
        } catch (err) {
          error ||= [err];
        }
      }
    }
    if (error) throw error[0];
  }
}

/**
 * Applies `apply(node, read(arg))` now and on every change of the sources `read` touched
 * in its latest call. A binding whose first call reads no source never runs again.
 */
export function bind<N, V, A = undefined>(node: N, read: (arg: A) => V, apply: (node: N, value: V) => unknown, arg?: A): void {
  const v = gather(read, arg) as V;
  const s = Got;
  apply(node, v);
  if (!s) return;
  const b = new Bound(node, read as Reader, apply as Apply, arg, s, v);
  each(s, link, b);
  if (Owner) {
    b.nx = Owner.b || null;
    Owner.b = b;
  }
}

/** Passes `err` to the nearest error handler above `owner`, or throws it. */
export function handleError(owner: OwnerNode | null, err: unknown): void {
  recover(owner, err);
}
