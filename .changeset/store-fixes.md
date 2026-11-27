---
"@surgijs/store": minor
---

- `createStore({ retry, retryDelay, staleTime, gcTime, refetchOnFocus, refetchOnReconnect })` now applies to remotes that do not set the option; `remote()` used to pin `retry`, `retryDelay`, `refetchOnFocus` and `refetchOnReconnect` itself.
- When `deps` change, the field resets to `placeholderData` / `undefined` and `status` is `pending` instead of showing the previous deps' data. `keepPreviousData: true` restores the old behavior. `status()` gains `dataDeps` and `isPreviousData`.
- `remote({ debounce })` delays the fetch after a `deps` change.
- `createRemote<State>()` gives `get` typed sync fields; `ctx.deps` has the type `deps` returns.
- New `persist` (localStorage) and `syncLocation` (URL) helpers.
- New `@surgijs/store/core` entry: `fromStore` and `fromStatus` return `@surgijs/core` signals.
