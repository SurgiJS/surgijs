# Changesets

Each change to a public package (`surgijs`, `@surgijs/compiler`) ships with a changeset. Run `pnpm changeset`, pick the packages, choose the bump and describe the change in one or two sentences.

Both packages belong to one `fixed` group and always release with the same version: compiler output and runtime helpers change together. Before `1.0`, breaking changes bump the minor version.
