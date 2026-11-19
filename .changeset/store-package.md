---
"@surgijs/store": minor
---

Initial `@surgijs/store`: one-object store with `remote({ deps, fetch })` (fetch only when deps change), `fromResponse` / `RemoteError` (empty 200 vs 404 vs 200+error body), rich `status()` for UI, `gcTime` TTL, jotai-style `action` / `derived`, and React `useStore` snapshots.
