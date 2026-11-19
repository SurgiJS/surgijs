# @surgijs/store

Framework-agnostic store (React, Angular, SurgiJS, or plain JS). One object, lazy remotes, deep-equality watches, GC with TTL after the last reader leaves (default 5 minutes). Not tied to the SurgiJS runtime.

```bash
npm i @surgijs/store
```

```ts
import { createStore, remote, action } from '@surgijs/store';

const store = createStore({
  userId: 1,
  user: remote({
    key: (s) => `/api/users/${s.userId}`,
    fetch: (url, { signal }) => fetch(String(url), { signal }).then((r) => r.json()),
  }),
});

const bump = action((get, set, by: number) => set('userId', get('userId') + by));
bump(store, 1);
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
