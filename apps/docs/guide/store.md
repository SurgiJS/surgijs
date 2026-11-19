# @surgijs/store

Framework-agnostic store (React, Angular, SurgiJS, or plain JS). One object, lazy remotes, deep-equality watches, GC with TTL after the last reader leaves (default 5 minutes). Not tied to the SurgiJS runtime.

```bash
npm i @surgijs/store
```

```ts
import { createStore, remote, action } from '@surgijs/store';

const store = createStore({
  userId: 1,
  windowLocation: '/api/search',
  windowQueryParams: { q: '' } as Record<string, string>,
  user: remote({
    key: (get) => `/api/users/${get.userId}`,
    fetch: (_get, { signal, key }) => fetch(String(key), { signal }).then((r) => r.json()),
  }),
  results: remote({
    key: (get) => [get.windowLocation, get.windowQueryParams],
    fetch: (get, { signal }) => {
      const path = get('windowLocation') as string;
      const q = new URLSearchParams(get('windowQueryParams') as Record<string, string>);
      return fetch(`${path}?${q}`, { signal }).then((r) => r.json());
    },
  }),
});

store.set('windowQueryParams', { q: 'ada' }); // refetches results
```

## React snapshot

```tsx
import { StoreProvider, useStore } from '@surgijs/store/react';

function Profile() {
  const { userId, user: details } = useStore();
  console.log(userId, details);
  return <div>{details?.name}</div>;
}

<StoreProvider store={store}>
  <Profile />
</StoreProvider>;
```

See the [package README](https://github.com/SurgiJS/surgijs/tree/main/packages/store) for remotes, `send` / `refetch`, `derived`, and benchmarks vs zustand, jotai, valtio, nanostores, and redux.
