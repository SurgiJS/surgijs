# @surgijs/store

Framework-agnostic store (React, Angular, SurgiJS, or plain JS). One object, lazy remotes with **`deps`** (fetch only when deps change), rich **`status()`** for UI, GC with TTL (default 5 minutes). Not tied to the SurgiJS runtime.

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
```

## Status for UI

```ts
const st = store.status('results');

st.status; // 'pending' | 'success' | 'empty' | 'err' — one place for UI
st.isPending; // first load, no settle yet
st.isFetching; // request in flight (incl. background refetch)
st.isSuccess; // last settle ok — including empty `null` / `[]`
st.isEmpty; // success with empty payload (not a 404)
st.isError; // 404, network, or 200 + `{ ok: false }` / `{ error }`
st.httpStatus; // 200 | 404 | …
st.code; // app or HTTP code
st.error; // RemoteError with `.status`, `.code`, `.body`
st.age; // ms since last successful data
st.source; // 'network' | 'cache'
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

const createUser = mutation(async (input: { name: string }, { signal, report, refetch }) => {
  const res = await fetch('/api/users', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
    signal,
  });
  const user = await fromResponse<User>(res, { report });
  await refetch('users'); // reload list after create
  return user;
});

// submit
await createUser(store, { name: 'Ada' });

// UI
const st = createUser.status(store);
// st.status → 'idle' | 'pending' | 'success' | 'err'
// st.isPending | st.isError | st.isSuccess | st.httpStatus | st.code | st.data
```

One-off without a reusable mutation object:

```ts
await store.mutate(async ({ set, signal, report, refetch }) => {
  const res = await fetch('/api/users', { method: 'POST', body: /* … */, signal });
  const user = await fromResponse<User>(res, { report });
  await refetch('users');
  set('selectedId', user.id);
  return user;
});
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
