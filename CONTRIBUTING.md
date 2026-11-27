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
| `pnpm test` | vitest for the compiler (node), the runtime and `@surgijs/ui` (happy-dom) |
| `pnpm size` | gzip budgets for the runtime and the example apps |
| `pnpm build` | tsup builds of every package in `packages/` |
| `pnpm dev` | playground on Vite |
| `pnpm docs:dev` | documentation site |
| `pnpm storybook` | Storybook for `@surgijs/ui` |
| `pnpm test:e2e` | builds, then runs Playwright in Docker: behavior, axe accessibility audits and SSR in Chromium, Firefox and WebKit, plus visual regression in Chromium |
| `pnpm test:e2e:update` | the same, rewriting the screenshot baselines |
| `node tools/check-min-core.mjs <ui\|store>` | builds and tests the package against the lowest published `@surgijs/core` its peer range allows (CI job `min-core`) |
| `pnpm bench [ids...] [--rows N]` | benchmark in headless Chrome (`CHROME_PATH` overrides the binary) |

Run `pnpm typecheck && pnpm test && pnpm size && pnpm build` before every commit.

## Layout

- `packages/surgijs`: runtime, zero dependencies, `sideEffects: false`.
- `packages/compiler`: JSX compiler and the Vite / esbuild plugins; `oxc-parser` is its only runtime dependency.
- `packages/store`: framework-agnostic `@surgijs/store` (optional React entry); no dependency on the runtime.
- `packages/ui`: `@surgijs/ui` web components; `@surgijs/core` is its peer.
- `apps/storybook`: stories for `@surgijs/ui` and the Playwright suite in `e2e/`.
- `apps/playground`: examples, also used by the runtime tests and the docs.
- `apps/docs`: VitePress site.
- `bench`: benchmark against other libraries; its dependencies stay out of the published packages.

## Workspace sources

Every entry in a package's `exports` has an `@surgijs/source` condition pointing at its TypeScript source. TypeScript (`customConditions` in `tsconfig.base.json`), Vite, Vitest, VitePress, Storybook (`tools/vite-workspace.ts`) and the esbuild scripts resolve with it, so tests, examples and dev servers run on sources without a build, and no config needs aliases or `paths`. A new entry point only needs its `exports` entry. Published consumers never set the condition and get `dist`.

## Changesets

Every change to `@surgijs/core`, `@surgijs/compiler`, `@surgijs/store` or `@surgijs/ui` comes with a changeset:

```bash
pnpm changeset
```

Both packages version together as a fixed group. Below 1.0, breaking changes bump the minor version. Merging to `main` opens a "Version Packages" pull request; merging that one publishes to npm.

## Size budgets

Budgets live in `packages/surgijs/scripts/bundle.mjs`. Raise a limit only when the behavior is correct and the extra bytes are necessary, and set the new limit tight to the measured size.

## UI components

Each component in `packages/ui/src/<name>/` has a view (`<name>.view.tsx`) shared by the client and the server, its CSS in `<name>.styles.ts`, and registration in `index.ts`; `src/server.ts` renders it with the view imported as `?ssr`. A new component comes with:

- unit and SSR tests in `packages/ui/test`;
- stories in `apps/storybook/stories`, which the Playwright suite picks up for axe audits and screenshots in both themes;
- a docs page in `apps/docs/ui`.

`packages/ui/custom-elements.json`, `src/react.ts` and `src/vue.ts` are generated from the `defineComponent` calls and props interfaces: run `pnpm --filter @surgijs/ui generate` after a change. The `manifest` test fails while they are stale.

Every visual value goes through a `--s-<component>-*` custom property that defaults to a token from `themes.css`. Component CSS avoids `<`, `>`, `&` and `"`, which the SSR compiler escapes inside `<style>`.

Screenshots come from the official Playwright image, so they only match when taken there: run `pnpm test:e2e` (Docker or Podman) rather than Playwright on the host. After an intended visual change, run `pnpm test:e2e:update`, look at the new images in `apps/storybook/e2e/__screenshots__`, and commit them.

## Code review

[CodeRabbit](https://coderabbit.ai) reviews every non-draft pull request to `main`; its settings live in `.coderabbit.yaml`. Mention `@coderabbitai` in a PR comment to ask it a question. `@coderabbitai review` reviews the commits pushed since its last review; `@coderabbitai full review` reviews the whole PR again. PRs with "Version Packages" (release PRs) or "WIP" in the title are skipped.

## Writing style

README, docs, comments and commit messages state what the code does, in affirmative sentences. Keep commits small, one feature each.

## Peer dependencies on workspace packages

Declare a peer on another workspace package as a plain range with an upper bound, for example `"@surgijs/core": ">=0.5.0 <1.0.0"`, and keep `workspace:*` in `devDependencies` only. A `workspace:^` peer is published as `^0.x`, which pins the minor version of a 0.x package, so every core minor release makes changesets bump dependents to a new major. Raise the lower bound by hand when a package needs a newer core.
