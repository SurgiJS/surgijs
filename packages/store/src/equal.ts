/** Structural equality for plain data. Same reference short-circuits. */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;

  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
    return true;
  }

  if (Array.isArray(b)) return false;

  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  let n = 0;
  for (const k in ao) {
    if (!Object.prototype.hasOwnProperty.call(ao, k)) continue;
    if (!Object.prototype.hasOwnProperty.call(bo, k) || !deepEqual(ao[k], bo[k])) return false;
    n++;
  }
  let m = 0;
  for (const k in bo) if (Object.prototype.hasOwnProperty.call(bo, k)) m++;
  return n === m;
}
