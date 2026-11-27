# @surgijs/store

Framework-agnostic store: **one object**, lazy remotes (`deps` / `staleTime` / retry / focus refetch), mutations with optimistic `setData`, deep-equality subscriptions, GC with TTL. Use from React, Vue, Svelte, Angular, SurgiJS, or plain JS.

```bash
npm i @surgijs/store
```

## One object

```ts
import { createStore, remote, fromResponse, action, mutation } from '@surgijs/store';

const store = createStore({
  windowLocation: '/api/search',
  windowQueryParams: { q: '' } as Record<string, string>,
  noise: 0,
  results: remote({
    deps: (get) => [get.windowLocation, get.windowQueryParams],
    staleTime: 30_000,
    retry: 2,
    fetch: async (get, { signal, report }) => {
      const path = get('windowLocation') as string;
      const params = new URLSearchParams(get('windowQueryParams') as Record<string, string>);
      const res = await fetch(`${path}?${params}`, { signal });
      return fromResponse(res, { report });
    },
  }),
});

store.set('windowQueryParams', { q: 'ada' }); // refetches results
store.set('noise', 1); // does not
await store.prefetch('results');

const st = store.status('results');
// st.status → 'pending' | 'success' | 'empty' | 'err'
// st.isStale | isFetching | httpStatus | code | age | source
```

`createStore(def, options)` options are the defaults for every `remote()`; an option on the remote wins. When `deps` change, `data` resets (or stays with `keepPreviousData: true`; see `status().isPreviousData` / `dataDeps`). Also available: `debounce`, `createRemote<State>()` for typed `get`, `persist`, `syncLocation`, and `@surgijs/store/core` (`fromStore`, `fromStatus`) for SurgiJS signals; `/vue`, `/svelte` and `/angular` have the same pair for their frameworks. Details in the [guide](../../apps/docs/guide/store.md).

**Remotes are top-level only.** No `remote()` inside nested objects and no `status('a.b.c')`.
For catalogs / details use sync route fields + flat remotes (`catalogProducts`, `productDetail`) linked by `deps` — see [guide: Complex stores](../../apps/docs/guide/store.md#complex-stores-important).

## Mutations + optimistic

```ts
const createUser = mutation(async (input, { getData, setData, signal, report, refetch }) => {
  const prev = getData('users');
  setData('users', [...(prev ?? []), { id: 'tmp', ...input }]);
  try {
    const res = await fetch('/api/users', { method: 'POST', body: JSON.stringify(input), signal });
    const user = await fromResponse(res, { report });
    await refetch('users');
    return user;
  } catch (e) {
    setData('users', prev);
    throw e;
  }
});
```

## Actions

```ts
const multiplyCount = action((get, set, by: number) => {
  set('count', get('count') * by);
});
multiplyCount(store, 2);
```

## React

```tsx
import { StoreProvider, useStore } from '@surgijs/store/react';

function Profile() {
  const { userId, user: details } = useStore();
  return <div>{details?.name}</div>;
}
```

## Vue, Svelte, Angular

```ts
import { fromStore } from '@surgijs/store/vue'; // Ref; also '@surgijs/store/svelte' (store contract) and '@surgijs/store/angular' (Signal)
const city = fromStore(store, (s) => s.city);
```

`fromStatus(store, key)` returns the remote's status in the same shape. Each entry ends its subscription with the framework's owner (component scope, Svelte unsubscribe, Angular `DestroyRef`). Vue and Angular are optional peer dependencies; the Svelte entry imports nothing.

## Benchmarks

`pnpm bench:store` vs zustand, jotai, valtio, nanostores, redux (+ stale/prefetch suites). Results: `packages/store/bench/results.json`.

## API

| API | Role |
| --- | --- |
| `createStore(def, opts?)` | one state object; remotes lazy |
| `remote({ deps, fetch, staleTime?, retry?, gcTime?, … })` | lazy field |
| `fromResponse` / `RemoteError` | empty 200 vs 404 vs 200+error body |
| `store.get` / `set` / `setData` | sync write / optimistic remote patch |
| `store.subscribe` | deep-equal watch |
| `store.status` / `refetch` / `prefetch` | UI status + reload / warm cache |
| `action` / `store.write` | jotai-style local writers |
| `mutation` | create/update/delete + status |
| `derived` | cached selector |
| `useStore` / `StoreProvider` | React |

With the Redux DevTools extension installed, each store shows up as **SurgiJS**. No import and no `connect()` call.

Docs: [guide](../../apps/docs/guide/store.md).

Docs for AI coding agents: [llms.txt](https://surgijs.github.io/surgijs/llms.txt) (index) and [llms-full.txt](https://surgijs.github.io/surgijs/llms-full.txt) (all pages in one file).
