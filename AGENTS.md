# AGENTS.md

Instructions for AI agents working on the SurgiJS repository itself. [CONTRIBUTING.md](CONTRIBUTING.md) holds the full contributor guide; this file lists what an agent needs to change code without breaking the repo. For using SurgiJS in an application, read `apps/docs` or the Context7 index of this repository.

## Project

SurgiJS compiles JSX/TSX into standard Web Components: the compiler hoists static HTML into templates and turns each dynamic expression into a direct binding. pnpm monorepo, Node 22+, TypeScript, ESM only.

| Path | Package | Role |
| --- | --- | --- |
| `packages/surgijs` | `@surgijs/core` | Runtime: signals, `defineComponent`, control flow, SSR, hydration. Zero dependencies. |
| `packages/compiler` | `@surgijs/compiler` | JSX compiler, Vite / Rollup and esbuild plugins. `oxc-parser` is the only runtime dependency. |
| `packages/store` | `@surgijs/store` | Framework-agnostic store. Does not depend on the runtime. |
| `packages/ui` | `@surgijs/ui` | Accessible web components. `@surgijs/core` is a peer. |
| `apps/docs` | private | VitePress documentation. |
| `apps/playground` | private | Examples used by runtime tests and docs. |
| `apps/storybook` | private | Stories for `@surgijs/ui` and the Playwright suite in `e2e/`. |
| `bench` | private | Benchmark against other libraries. |

## Commands

```bash
pnpm install
pnpm typecheck        # tsc --noEmit in every package
pnpm test             # vitest, all projects
pnpm size             # gzip budgets
pnpm build            # tsup builds of packages/*
```

Run all four before every commit. One package: `pnpm vitest run --project <name>` with `compiler`, `surgijs`, `store` or `ui`; add a file path to narrow it. Other scripts (`dev`, `docs:dev`, `storybook`, `test:e2e`, `bench`) are in the root `package.json`.

## Rules

- Tests and dev servers run on TypeScript sources through the `@surgijs/source` export condition. Do not add aliases or `paths`; a new entry point needs only its `exports` entry with that condition.
- `@surgijs/core` stays dependency-free and `sideEffects: false`: no imports from outside the package, no top-level side effects. CI fails on any entry in its `dependencies`.
- Size budgets live in `packages/surgijs/scripts/bundle.mjs`. A change that grows a bundle needs a reason; when a limit must rise, set it tight to the measured size.
- Compiler output must keep every dynamic expression as a direct binding and escape emitted HTML and attributes.
- UI components: view in `<name>.view.tsx` (runs on the server too, so no DOM access during render), CSS in `<name>.styles.ts` without `<`, `>`, `&`, `"`, every visual value through a `--s-<component>-*` custom property defaulting to a `themes.css` token. A new component also gets unit and SSR tests, a story, and a docs page in `apps/docs/ui`.
- After changing `defineComponent` calls or props interfaces in `packages/ui`, run `pnpm --filter @surgijs/ui generate`. It rewrites `custom-elements.json`, `src/react.ts` and `src/vue.ts`; do not edit them by hand.
- Screenshot baselines in `apps/storybook/e2e/__screenshots__` come only from `pnpm test:e2e:update` (Docker or Podman), never from a host Playwright run.
- Public API changes update `apps/docs` in the same commit, and code samples there match the current API.
- Do not edit `CHANGELOG.md` files, `pnpm-lock.yaml` by hand, or `bench/results*.json`.

## Changesets

A change to a published package (`@surgijs/core`, `@surgijs/compiler`, `@surgijs/store`, `@surgijs/ui`) comes with a file in `.changeset/` (`pnpm changeset`, or write the markdown by hand):

```md
---
"@surgijs/core": minor
---

One or two sentences on what changed for users.
```

`@surgijs/core` and `@surgijs/compiler` version together as a fixed group. Below 1.0, a breaking change bumps the minor version. Merging to `main` opens a "Version Packages" PR; merging that publishes to npm.

## Style

- README, docs, comments and commit messages state what the code does, in affirmative sentences. Comments explain intent and constraints, not the line below them.
- Keep commits small, one feature each. PR description follows `.github/pull_request_template.md`.
- Follow existing patterns and `.editorconfig`; do not add dependencies to published packages without need.

## Review

CodeRabbit reviews non-draft PRs to `main` using `.coderabbit.yaml`, which holds per-path review rules; keep those rules in step with the rules above when either changes.

## Context7

`context7.json` in the repository root configures how [Context7](https://context7.com) indexes this repository: the folders it parses (`apps/docs` and the package READMEs), what it skips, and the rules it serves to agents. When the public API or the docs layout changes, update the `rules` and `folders` there too.
