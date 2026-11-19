# @surgijs/store

Framework-agnostic store (React, Angular, SurgiJS, or plain JS). One object, lazy remotes with **`deps`**, **`staleTime`**, retry, focus/reconnect refetch, **`status()`** for UI, GC with TTL. Not tied to the SurgiJS runtime.

```bash
npm i @surgijs/store
```

## Remote + deps

`fetch` runs on first watch and when **`deps`** change — not on every store write.

```ts
import { createStore, remote, fromResponse } from '@surgijs/store';

const store = createStore({
  windowLocation: '/api/search',
  windowQueryParams: { q: '' } as Record<string, string>,
  noise: 0,
  results: remote({
    deps: (get) => [get.windowLocation, get.windowQueryParams],
    staleTime: 30_000, // fresh for 30s — skip remount/focus refetch
    retry: 2,
    refetchOnFocus: true,
    refetchOnReconnect: true,
    fetch: async (get, { signal, report }) => {
      const path = get('windowLocation') as string;
      const q = new URLSearchParams(get('windowQueryParams') as Record<string, string>);
      const res = await fetch(`${path}?${q}`, { signal });
      return fromResponse(res, { report });
    },
  }),
});

store.set('noise', 1); // does not call fetch
store.set('windowQueryParams', { q: 'ada' }); // does
await store.prefetch('results'); // warm cache without a subscriber
```

## Complex stores (important)

**`remote()` is top-level only.** Nested remotes and dotted status paths are **not** supported:

```ts
// ❌ does not work — remote buried in a nested object is treated as sync data
createStore({
  products: {
    apple: {
      macbooks: remote({ deps: () => '/…', fetch: … }),
    },
  },
});

// ❌ throws: "products.apple.macbooks" is not remote
store.status('products.apple.macbooks');
```

Shape complex apps as **nested sync UI state** + **flat named remotes** wired through `deps`:

```ts
const store = createStore({
  // UI / route — nesting is fine
  route: { catalog: 'apple', product: 'macbooks' } as {
    catalog: string;
    product: string;
  },
  filters: { q: '', page: 1 },
  selectedId: null as string | null,

  // server — one top-level remote per query
  catalogProducts: remote({
    deps: (get) => {
      const r = get('route') as { catalog: string; product: string };
      const f = get('filters') as { q: string; page: number };
      return ['/api/catalog', r.catalog, r.product, f.q, f.page];
    },
    fetch: async (_get, { signal, report, deps }) => {
      const [, catalog, product, q, page] = deps as [string, string, string, string, number];
      const res = await fetch(`/api/${catalog}/${product}?q=${q}&page=${page}`, { signal });
      return fromResponse(res, { report });
    },
  }),

  productDetail: remote({
    deps: (get) => get.selectedId,
    fetch: async (_get, { signal, report, deps }) => {
      if (deps == null) return null;
      const res = await fetch(`/api/products/${deps}`, { signal });
      return fromResponse(res, { report });
    },
  }),
});

store.set('route', { catalog: 'apple', product: 'macbooks' }); // refetch list
store.set('selectedId', 'mbp-14'); // refetch detail
store.status('catalogProducts'); // ✅ top-level name only
store.status('productDetail');
```

| In your head | In the store |
| --- | --- |
| `products.apple.macbooks` | `catalogProducts` + `route` |
| `user.profile` | `userProfile` |
| `cart.items` (server) | `cartItems` remote |
| `cart.items` (local only) | sync nested `cart` |

- **One store** — shared UI + related screens (same `deps` graph).
- **Several stores** — unrelated features (`authStore` / `shopStore`), each with its own provider or `useStore(shopStore)`.
- `status('…')` / `refetch` / `prefetch` / `setData` always take the **top-level remote key**, same as the field you read in `useStore`.

## Status for UI

```ts
const st = store.status('results');

st.status; // 'pending' | 'success' | 'empty' | 'err' — one place for UI
st.isPending; // first load, no settle yet
st.isFetching; // request in flight (incl. background refetch)
st.isStale; // past staleTime (or never loaded)
st.isSuccess; // last settle ok — including empty `null` / `[]`
st.isEmpty; // success with empty payload (not a 404)
st.isError; // 404, network, or 200 + `{ ok: false }` / `{ error }`
st.httpStatus; // 200 | 404 | …
st.code; // app or HTTP code
st.error; // RemoteError with `.status`, `.code`, `.body`
st.age; // ms since last successful data
st.source; // 'network' | 'cache' | 'optimistic'
st.staleTime;
st.gcTime;
st.deps;
```

Watch status in React:

```tsx
const list = useStore((s) => s.results);
const st = useStore(() => store.status('results'));

switch (st.status) {
  case 'pending':
    return <Spinner />;
  case 'err':
    return st.httpStatus === 404 ? <NotFound /> : <ErrorBanner code={st.code} error={st.error} />;
  case 'empty':
    return <Empty />;
  case 'success':
    return <Rows items={list!} refreshing={st.isFetching} />;
}
```

`fromResponse` distinguishes:

| Response | Result |
| --- | --- |
| `200` / `204` empty body | `data: null`, `isSuccess`, `isEmpty` |
| `200` + `[]` | `isSuccess`, `isEmpty` |
| `404` | `isError`, `httpStatus: 404` |
| `200` + `{ ok: false, code, message }` | `isError`, `httpStatus: 200`, `code` |

## Mutations (create / update / delete)

`remote` is for **reads**. For uploads use **`mutation`** — own pending/error status, then `refetch` the list.

```ts
import { createStore, mutation, remote, fromResponse } from '@surgijs/store';

type User = { id: string; name: string };

const store = createStore({
  users: remote({
    deps: () => '/api/users',
    fetch: async (_get, { signal, report, deps }) => {
      const res = await fetch(String(deps), { signal });
      return fromResponse<User[]>(res, { report });
    },
  }),
});

const createUser = mutation(async (input: { name: string }, { getData, setData, signal, report, refetch }) => {
  const prev = getData('users');
  setData('users', [...(prev ?? []), { id: 'tmp', ...input }]); // optimistic
  try {
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
      signal,
    });
    const user = await fromResponse<User>(res, { report });
    await refetch('users');
    return user;
  } catch (e) {
    setData('users', prev); // rollback
    throw e;
  }
});

await createUser(store, { name: 'Ada' });

const st = createUser.status(store);
// st.status → 'idle' | 'pending' | 'success' | 'err'
```

## Pagination example

```ts
type Page = { items: { id: string; title: string }[]; total: number };

const store = createStore({
  page: 1,
  pageSize: 20,
  query: '',
  list: remote({
    deps: (get) => [get.page, get.pageSize, get.query],
    fetch: async (get, { signal, report }) => {
      const page = get('page') as number;
      const pageSize = get('pageSize') as number;
      const query = get('query') as string;
      const url = `/api/items?page=${page}&limit=${pageSize}&q=${encodeURIComponent(query)}`;
      const res = await fetch(url, { signal });
      return fromResponse<Page>(res, { report });
    },
    gcTime: 5 * 60 * 1000,
  }),
});

// controls
store.set('page', 2); // refetch — deps changed
store.set('query', 'ada'); // refetch from page identity in deps

// UI
store.subscribe(() => store.status('list'), (st) => {
  switch (st.status) {
    case 'pending':
      showSpinner();
      break;
    case 'err':
      showError(st.httpStatus, st.code, st.error);
      break;
    case 'empty':
      showEmpty();
      break;
    case 'success':
      showPage(st.data!, { refreshing: st.isFetching, age: st.age });
      break;
  }
});

store.write((get, set) => {
  const total = get((s) => s.list)?.total ?? 0;
  const size = get('pageSize') as number;
  const pages = Math.max(1, Math.ceil(total / size));
  set('page', Math.min((get('page') as number) + 1, pages));
})();
```

## React snapshot

```tsx
import { StoreProvider, useStore } from '@surgijs/store/react';

function Profile() {
  const { userId, user: details } = useStore();
  return <div>{details?.name}</div>;
}

<StoreProvider store={store}>
  <Profile />
</StoreProvider>;
```

More: [package README](https://github.com/SurgiJS/surgijs/tree/main/packages/store), benches via `pnpm bench:store`.
