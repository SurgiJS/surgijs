# @surgijs/store

## 3.0.0

### Patch Changes

- Updated dependencies [[`887ce52`](https://github.com/SurgiJS/surgijs/commit/887ce52b03228868f5cf0981d739d03745da1018), [`8a05670`](https://github.com/SurgiJS/surgijs/commit/8a056700de7d8d64d7f1024eb8272bac4c1b1404)]:
  - @surgijs/core@0.5.0

## 2.0.0

### Minor Changes

- [#18](https://github.com/SurgiJS/surgijs/pull/18) [`5a2a5a2`](https://github.com/SurgiJS/surgijs/commit/5a2a5a2fda8a33adbda3b66ce1117a9ba69d2def) Thanks [@banzalik](https://github.com/banzalik)! - React DevTools shows the component tree while Vite is serving: the plugin loads the adapter, and production bundles leave it out. Redux DevTools shows each store when the extension is installed, and jumping to a state writes it back.

### Patch Changes

- Updated dependencies [[`5a2a5a2`](https://github.com/SurgiJS/surgijs/commit/5a2a5a2fda8a33adbda3b66ce1117a9ba69d2def), [`255a196`](https://github.com/SurgiJS/surgijs/commit/255a196f9ba1cb4785cf83f74f72a78b6072043d)]:
  - @surgijs/core@0.4.0

## 1.0.0

### Minor Changes

- [#12](https://github.com/SurgiJS/surgijs/pull/12) [`ae29824`](https://github.com/SurgiJS/surgijs/commit/ae298246a7a1b0a784e45107f564c4eacbe88d0e) Thanks [@banzalik](https://github.com/banzalik)! - - `createStore({ retry, retryDelay, staleTime, gcTime, refetchOnFocus, refetchOnReconnect })` now applies to remotes that do not set the option; `remote()` used to pin `retry`, `retryDelay`, `refetchOnFocus` and `refetchOnReconnect` itself.
  - When `deps` change, the field resets to `placeholderData` / `undefined` and `status` is `pending` instead of showing the previous deps' data. `keepPreviousData: true` restores the old behavior. `status()` gains `dataDeps` and `isPreviousData`.
  - `remote({ debounce })` delays the fetch after a `deps` change.
  - `createRemote<State>()` gives `get` typed sync fields; `ctx.deps` has the type `deps` returns.
  - New `persist` (localStorage) and `syncLocation` (URL) helpers.
  - New `@surgijs/store/core` entry: `fromStore` and `fromStatus` return `@surgijs/core` signals.

### Patch Changes

- Updated dependencies [[`8d42848`](https://github.com/SurgiJS/surgijs/commit/8d428485fb77fa17092a88d7302e083d0db3148e)]:
  - @surgijs/core@0.3.0

## 0.2.0

### Minor Changes

- [#6](https://github.com/SurgiJS/surgijs/pull/6) [`967c285`](https://github.com/SurgiJS/surgijs/commit/967c285d99ab7b35717724165bc8ce23fc31f65c) Thanks [@banzalik](https://github.com/banzalik)! - Initial `@surgijs/store`: one-object store with `remote({ deps, fetch })` (fetch only when deps change), `fromResponse` / `RemoteError` (empty 200 vs 404 vs 200+error body), rich `status()` for UI, `gcTime` TTL, jotai-style `action` / `derived`, and React `useStore` snapshots.

## 0.1.0

### Minor Changes

- Initial release
