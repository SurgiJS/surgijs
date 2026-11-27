# Contributing

## Setup

Node 22 and pnpm (version pinned in `packageManager`):

```bash
corepack enable
pnpm install
```

## Commands

| Command | What it does |
| --- | --- |
| `pnpm typecheck` | `tsc --noEmit` in every package, tests and examples included |
| `pnpm test` | vitest for the compiler (node) and the runtime (happy-dom) |
| `pnpm size` | gzip budgets for the runtime and the example apps |
| `pnpm build` | tsup builds of `@surgijs/core` and `@surgijs/compiler` |
| `pnpm dev` | playground on Vite |
| `pnpm docs:dev` | documentation site |
| `pnpm bench [ids...] [--rows N]` | benchmark in headless Chrome (`CHROME_PATH` overrides the binary) |

Run `pnpm typecheck && pnpm test && pnpm size && pnpm build` before every commit.

## Layout

- `packages/surgijs`: runtime, zero dependencies, `sideEffects: false`.
- `packages/compiler`: JSX compiler and the Vite / esbuild plugins; `oxc-parser` is its only runtime dependency.
- `packages/store`: framework-agnostic `@surgijs/store` (optional React entry); no dependency on the runtime.
- `apps/playground`: examples, also used by the runtime tests and the docs.
- `apps/docs`: VitePress site.
- `bench`: benchmark against other libraries; its dependencies stay out of the published packages.

## Changesets

Every change to `@surgijs/core`, `@surgijs/compiler`, or `@surgijs/store` comes with a changeset:

```bash
pnpm changeset
```

Both packages version together as a fixed group. Below 1.0, breaking changes bump the minor version. Merging to `main` opens a "Version Packages" pull request; merging that one publishes to npm.

## Size budgets

Budgets live in `packages/surgijs/scripts/bundle.mjs`. Raise a limit only when the behavior is correct and the extra bytes are necessary, and set the new limit tight to the measured size.

## Code review

[CodeRabbit](https://coderabbit.ai) reviews every non-draft pull request to `main`; its settings live in `.coderabbit.yaml`. Mention `@coderabbitai` in a PR comment to ask it a question. `@coderabbitai review` reviews the commits pushed since its last review; `@coderabbitai full review` reviews the whole PR again. PRs with "Version Packages" (release PRs) or "WIP" in the title are skipped.

## Writing style

README, docs, comments and commit messages state what the code does, in affirmative sentences. Keep commits small, one feature each.
