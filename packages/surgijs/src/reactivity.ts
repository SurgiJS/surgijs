export type Accessor<T> = () => T;
export type Setter<T> = <U extends T>(value: U | ((prev: T) => U)) => U;
export type Signal<T> = [get: Accessor<T>, set: Setter<T>];

/** Reactive value: `v` holds the value, `o` the observers. */
export interface Source {
  v: unknown;
  o: Observer[] | null;
}

/** Queued work. `t` picks the queue: 0 memo, 1 render, 2 user effect. `st`: 0 idle, 1 queued, -1 disposed. */
interface Observer {
  st: number;
  t: number;
  run(): void;
  d(): void;
}

type Cleanup = (() => void) | Observer;

/** Owner: `c` cleanups and owned computations, `p` parent, `k` context, `e` error handler. */
export interface OwnerNode {
  c: Cleanup[] | null;
  p: OwnerNode | null;
  k: Record<symbol, unknown> | null;
  e?: ((err: unknown) => void) | undefined;
}

let Owner: OwnerNode | null = null;
let Listener: Comp | null = null;
let Collect: Source[] | null = null;
let Index = 0;
let Fresh: Source[] | null = null;
let Deferred: Comp[] | null = null;
let scheduled = false;
let running = false;
let depth = 0;
let Queues: Observer[][] = [[], [], []];

function track(s: Source): void {
  if (Collect) {
    if (Collect[Collect.length - 1] !== s) Collect.push(s);
  } else if (Fresh) Fresh.push(s);
  else if (Listener!.s && Listener!.s[Index] === s) Index++;
  else Fresh = [s];
}

function link(s: Source, o: Observer): void {
  if (s.o) s.o.push(o);
  else s.o = [o];
}

function unlink(s: Source, o: Observer): void {
  const list = s.o!;
  const i = list.lastIndexOf(o);
  const last = list.pop()!;
  if (i < list.length) list[i] = last;
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

function cleanup(o: OwnerNode): void {
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

/** Runs every queued computation now: memos first, then render effects, then effects. */
export function flush(): void {
  if (running) return;
  running = true;
  scheduled = false;
  let error: [unknown] | undefined;
  try {
    for (let i = 0; i < 3; ) {
      const q = Queues[i]!;
      if (!q.length) {
        i++;
        continue;
      }
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
  p: OwnerNode | null = Owner;
  k: Record<symbol, unknown> | null = Owner ? Owner.k : null;
  st = 0;
  s: Source[] | null = null;
  o: Observer[] | null = null;
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
    const fresh = Fresh as typeof prevFresh;
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
      if (this.o) for (const o of this.o) mark(o);
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

/** Binding with fixed sources: `n` node, `r` reader, `a` apply, `x` reader arguments, `s` sources. */
class Bound implements Observer {
  declare t: number;
  st = 0;
  n: unknown;
  r: (...args: unknown[]) => unknown;
  a: (node: unknown, value: unknown) => unknown;
  x: unknown[] | undefined;
  s: Source | Source[];
  v: unknown;

  constructor(n: unknown, r: Bound['r'], a: Bound['a'], x: unknown[] | undefined, s: Source | Source[], v: unknown) {
    this.n = n;
    this.r = r;
    this.a = a;
    this.x = x;
    this.s = s;
    this.v = v;
  }

  run(): void {
    this.st = 0;
    const v = this.x ? this.r(...this.x) : this.r();
    if (!Object.is(v, this.v)) this.a(this.n, (this.v = v));
  }

  d(): void {
    this.st = -1;
    const s = this.s;
    if (Array.isArray(s)) for (const x of s) unlink(x, this);
    else unlink(s, this);
  }
}
Bound.prototype.t = 1;

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
        if (s.o) for (const o of s.o) mark(o);
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
  const root: OwnerNode = { c: null, p: owner, k: owner ? owner.k : null };
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
    for (const c of list) if (!c.st) c.run();
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
  if (!sources.length) return;
  const b = new Bound(node, read, apply as Bound['a'], x, sources.length > 1 ? sources : sources[0]!, v);
  for (const s of sources) link(s, b);
  own(b);
}

/** Passes `err` to the nearest error handler above `owner`, or throws it. */
export function handleError(owner: OwnerNode | null, err: unknown): void {
  recover(owner, err);
}
