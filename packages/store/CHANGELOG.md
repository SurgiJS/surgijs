# @surgijs/store

## 0.3.0

### Minor Changes

- [#30](https://github.com/SurgiJS/surgijs/pull/30) [`7bb6dfd`](https://github.com/SurgiJS/surgijs/commit/7bb6dfd63df296e3961fe2be7834c6a2891ab88b) Thanks [@banzalik](https://github.com/banzalik)! - Changes from the withdrawn 1.0.0, 2.0.0 and 3.0.0 releases, which were published by mistake and are removed from npm.

  - `createStore({ retry, retryDelay, staleTime, gcTime, refetchOnFocus, refetchOnReconnect })` now applies to remotes that do not set the option; `remote()` used to pin `retry`, `retryDelay`, `refetchOnFocus` and `refetchOnReconnect` itself.
  - When `deps` change, the field resets to `placeholderData` / `undefined` and `status` is `pending` instead of showing the previous deps' data. `keepPreviousData: true` restores the old behavior. `status()` gains `dataDeps` and `isPreviousData`.
  - `remote({ debounce })` delays the fetch after a `deps` change.
  - `createRemote<State>()` gives `get` typed sync fields; `ctx.deps` has the type `deps` returns.
  - New `persist` (localStorage) and `syncLocation` (URL) helpers.
  - New `@surgijs/store/core` entry: `fromStore` and `fromStatus` return `@surgijs/core` signals.
  - Redux DevTools shows each store when the extension is installed, and jumping to a state writes it back.

## 0.2.0

### Minor Changes

- [#6](https://github.com/SurgiJS/surgijs/pull/6) [`967c285`](https://github.com/SurgiJS/surgijs/commit/967c285d99ab7b35717724165bc8ce23fc31f65c) Thanks [@banzalik](https://github.com/banzalik)! - Initial `@surgijs/store`: one-object store with `remote({ deps, fetch })` (fetch only when deps change), `fromResponse` / `RemoteError` (empty 200 vs 404 vs 200+error body), rich `status()` for UI, `gcTime` TTL, jotai-style `action` / `derived`, and React `useStore` snapshots.

## 0.1.0

### Minor Changes

- Initial release
