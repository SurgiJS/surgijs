/** Read `obj` at a path of property names. */
export function getPath(obj: unknown, path: readonly string[]): unknown {
  let cur: unknown = obj;
  for (let i = 0; i < path.length; i++) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[path[i]!];
  }
  return cur;
}

/**
 * Readonly tracking proxy for destructuring snapshots.
 * Each property read records its path into `paths` (mutated in place).
 */
export function createSnapshot<T>(value: T, paths: string[][], base: string[] = []): T {
  if (value === null || typeof value !== 'object') return value;

  return new Proxy(value as object, {
    get(target, prop, receiver) {
      if (typeof prop === 'symbol') return Reflect.get(target, prop, receiver);
      const path = base.concat(prop);
      paths.push(path);
      return createSnapshot(Reflect.get(target, prop, receiver), paths, path);
    },
    ownKeys: (target) => Reflect.ownKeys(target),
    getOwnPropertyDescriptor: (target, prop) => Reflect.getOwnPropertyDescriptor(target, prop),
    has: (target, prop) => Reflect.has(target, prop),
    set: () => {
      throw new Error('@surgijs/store: snapshot is readonly; use store.set');
    },
    deleteProperty: () => {
      throw new Error('@surgijs/store: snapshot is readonly; use store.set');
    },
  }) as T;
}

export function pathsEqual(a: string[][], b: string[][]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    if (x.length !== y.length) return false;
    for (let j = 0; j < x.length; j++) if (x[j] !== y[j]) return false;
  }
  return true;
}
