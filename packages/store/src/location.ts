import type { Store } from './store';

export interface SyncLocationOptions {
  /** Sync field (string) bound to `location.pathname`. */
  path?: string;
  /** Sync field (`Record<string, string>`) bound to `location.search`. */
  query?: string;
  /** `push` (default) adds a history entry per change; `replace` rewrites the current one. */
  history?: 'push' | 'replace';
}

const parseQuery = (search: string): Record<string, string> => Object.fromEntries(new URLSearchParams(search));

/**
 * Two-way binding between the URL and sync fields, so `remote` deps can read the route:
 *
 * ```ts
 * const store = createStore({ path: '/', query: {} as Record<string, string>, items: remote({ deps: (get) => [get.path, get.query], … }) });
 * syncLocation(store, { path: 'path', query: 'query' });
 * store.set('query', { page: '2' }); // pushes ?page=2
 * ```
 *
 * Back / forward update the store. Returns a function that removes the listeners.
 */
export function syncLocation<D extends Record<string, unknown>>(store: Store<D>, options: SyncLocationOptions): () => void {
  if (typeof window === 'undefined') return () => {};
  const { path, query } = options;
  const set = store.set as (partial: Record<string, unknown>) => void;
  const read = store.get as () => Record<string, unknown>;

  const fromUrl = (): void => {
    const patch: Record<string, unknown> = {};
    if (path) patch[path] = location.pathname;
    if (query) patch[query] = parseQuery(location.search);
    set(patch);
  };

  const toUrl = (): void => {
    const state = read();
    const nextPath = path ? String(state[path]) : location.pathname;
    const params = query ? new URLSearchParams(state[query] as Record<string, string>).toString() : location.search.slice(1);
    const url = nextPath + (params ? `?${params}` : '') + location.hash;
    if (url === location.pathname + location.search + location.hash) return;
    history[options.history === 'replace' ? 'replaceState' : 'pushState'](null, '', url);
  };

  fromUrl();
  window.addEventListener('popstate', fromUrl);
  const stop = store.subscribe(
    (s) => [path && (s as Record<string, unknown>)[path], query && (s as Record<string, unknown>)[query]],
    toUrl,
  );
  return () => {
    window.removeEventListener('popstate', fromUrl);
    stop();
  };
}
