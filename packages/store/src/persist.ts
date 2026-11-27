import type { SyncKeys } from './remote';
import type { Store } from './store';

export interface PersistOptions<D extends Record<string, unknown>> {
  /** Storage key. */
  name: string;
  /** Sync fields to save. */
  keys: readonly SyncKeys<D>[];
  /** Default `localStorage`. */
  storage?: Pick<Storage, 'getItem' | 'setItem'>;
}

/**
 * Restore sync fields from `localStorage` now and save them on every change.
 * Missing, malformed or unavailable storage is ignored. Returns an unsubscribe function.
 *
 * ```ts
 * persist(store, { name: 'app', keys: ['cityId', 'theme'] });
 * ```
 */
export function persist<D extends Record<string, unknown>>(store: Store<D>, options: PersistOptions<D>): () => void {
  const keys = options.keys as readonly string[];
  let storage: PersistOptions<D>['storage'];
  try {
    storage = options.storage ?? (typeof localStorage === 'undefined' ? undefined : localStorage);
  } catch {
    storage = undefined;
  }
  if (!storage) return () => {};

  try {
    const raw = storage.getItem(options.name);
    if (raw) {
      const saved = JSON.parse(raw) as Record<string, unknown> | null;
      if (saved && typeof saved === 'object') {
        const patch: Record<string, unknown> = {};
        for (const key of keys) if (key in saved) patch[key] = saved[key];
        (store.set as (partial: Record<string, unknown>) => void)(patch);
      }
    }
  } catch {
    // Corrupt value or an unknown key: start from the defaults.
  }

  const target = storage;
  return store.subscribe(
    (s) => {
      const out: Record<string, unknown> = {};
      for (const key of keys) out[key] = (s as Record<string, unknown>)[key];
      return out;
    },
    (value) => {
      try {
        target.setItem(options.name, JSON.stringify(value));
      } catch {
        // Quota exceeded or storage disabled.
      }
    },
  );
}
