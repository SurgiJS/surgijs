# @surgijs/store

Framework-agnostic store: **one object**, lazy remote fields, jotai-style writers, deep-equality subscriptions, GC with TTL when nothing watches. Use it from React, Angular, SurgiJS, or plain JS.

```bash
npm i @surgijs/store
```

## One object

```ts
import { createStore, remote, action, derived } from '@surgijs/store';

const store = createStore({
  userId: 1,
  q: '',
  user: remote({
    key: (s) => `/api/users/${s.userId}`,
    fetch: (url, { signal }) => fetch(String(url), { signal }).then((r) => r.json()),
  }),
  users: remote({
    key: (s) => `/api/users?q=${s.q}`,
    fetch: (url, { signal }) => fetch(String(url), { signal }).then((r) => r.json()),
  }),
});
```

- First `subscribe` / `useStore` read of `user` loads it.
- After the last unsubscribe, data stays for **`gcTime`** (default **5 minutes**), then unloads. Re-subscribe within the window reuses the cache (no refetch if `key` is unchanged).
- `gcTime: 0` unloads immediately; `Infinity` keeps forever. Set per field or via `createStore(def, { gcTime })`.
- Changing `userId` or `q` refetches while watched.
- `store.refetch('user')` forces a reload; `store.send('users', { method: 'POST', body })` posts then refetches.

```ts
remote({
  key: (s) => `/api/users/${s.userId}`,
  fetch: (url, { signal }) => fetch(String(url), { signal }).then((r) => r.json()),
  gcTime: 5 * 60 * 1000, // optional; default 5 minutes
});
```

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

Raw numbers are written to `packages/store/bench/results.json`.

## API

| API | Role |
| --- | --- |
| `createStore(def, { gcTime? })` | one state object; `remote()` fields are lazy |
| `remote({ key, fetch, gcTime? })` | lazy field; TTL after last unsubscribe (default 5m) |
| `store.get` / `set` | read / write sync fields |
| `store.subscribe(select, fn)` | watch a slice; deep-equal by default |
| `store.meta` / `refetch` / `send` | remote status, reload, POST+refetch |
| `action` / `store.write` | jotai-style writers |
| `derived` | cached selector |
| `useStore` / `StoreProvider` | React snapshot or selector |
