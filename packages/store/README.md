# @surgijs/store

Framework-agnostic store: **one object**, lazy remote fields, jotai-style writers, deep-equality subscriptions, GC with TTL when nothing watches. Use it from React, Angular, SurgiJS, or plain JS.

```bash
npm i @surgijs/store
```

## One object

```ts
import { createStore, remote, fromResponse, action, derived } from '@surgijs/store';

const store = createStore({
  windowLocation: '/api/search',
  windowQueryParams: { q: '' } as Record<string, string>,
  noise: 0,
  results: remote({
    // fetch runs only when these change — not when `noise` changes
    deps: (get) => [get.windowLocation, get.windowQueryParams],
    fetch: async (get, { signal, report }) => {
      const path = get('windowLocation') as string;
      const params = new URLSearchParams(get('windowQueryParams') as Record<string, string>);
      const res = await fetch(`${path}?${params}`, { signal });
      // empty 200 → null (isEmpty); 404 → error; 200+{ok:false} → error with code
      return fromResponse(res, { report });
    },
  }),
});

store.set('windowQueryParams', { q: 'ada' }); // refetches results
store.set('noise', 1); // does not call results.fetch

const st = store.status('results');
// st.isPending | isFetching | isSuccess | isEmpty | isError
// st.httpStatus | st.code | st.age | st.source | st.deps | st.gcTime
```

- **`deps`** decides when `fetch` runs. Unrelated writes do not call `fetch`.
- **`fromResponse` + `report`**: empty 200 ≠ 404; supports error codes and `200` bodies with `{ ok: false }` / `{ error }`.
- **`store.status(name)`** for UI spinners / empty / not-found / error codes.
- **`gcTime`** (default 5 minutes) after last unsubscribe; `0` = immediate, `Infinity` = keep.
- Pagination example: [docs guide](../../apps/docs/guide/store.md).

## Watch without extra repaints

Subscriptions use **deep equality** by default. Rewriting a field with the same structure does not notify.

```ts
store.subscribe(
  (s) => s.user,
  (user) => render(user),
);

store.set('userId', 1); // no-op if already 1
```

## Actions (jotai-style writers)

```ts
const multiplyCount = action((get, set, by: number) => {
  set('count', get('count') * by);
});

multiplyCount(store, 2);
// or
store.write((get, set, by: number) => set('count', get('count') * by))(2);
```

Cached derived reads keep the previous reference when the value is deeply equal:

```ts
const double = derived((get) => get('count') * 2);
double(store);
```

## React: destructure the snapshot

```tsx
import { StoreProvider, useStore } from '@surgijs/store/react';

<StoreProvider store={store}>
  <Profile />
</StoreProvider>;

function Profile() {
  // Tracks only the paths you read. Re-renders when those paths change (deep equal).
  const { userId, user: details } = useStore();
  console.log(userId, details);

  // Nested destructuring also works:
  // const { profile: { user: details } } = useStore();

  // Or pass the store / a selector explicitly:
  // const { userId } = useStore(store);
  // const id = useStore((s) => s.userId);
}
```

Plain JS / Angular: use `store.subscribe` / `store.get` / `store.set` — no React dependency.

## Benchmarks

Node microbenchmarks vs popular stores (`pnpm bench:store`), 50k iterations, 50 subscribers:

| Suite | @surgijs/store vs best |
| --- | --- |
| Update watched field | ~2× zustand (ahead of jotai / nanostores / valtio) |
| Deep-equal rewrite (skip notify) | ~1.8× zustand ref-eq; skips notify when structure matches |
| Action + derived | ~1.8× nanostores |
| Noise update (unrelated field) | beats zustand / redux / jotai / valtio (key-indexed subs) |
| Remote deps (fetch only on deps change) | see `pnpm bench:store` |

Raw numbers are written to `packages/store/bench/results.json`.

## API

| API | Role |
| --- | --- |
| `createStore(def, { gcTime? })` | one state object; `remote()` fields are lazy |
| `remote({ deps, fetch, gcTime? })` | lazy field; `fetch` only when `deps` changes |
| `fromResponse` / `RemoteError` | empty 200 vs 404 vs 200+error body |
| `store.get` / `set` | read / write sync fields |
| `store.subscribe(select, fn)` | watch a slice; deep-equal by default |
| `store.status` / `refetch` / `send` | UI status, reload, POST+refetch |
| `action` / `store.write` | jotai-style writers |
| `derived` | cached selector |
| `useStore` / `StoreProvider` | React snapshot or selector |
