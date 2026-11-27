#!/usr/bin/env sh
# Runs the Playwright suite in the official image, so screenshots are identical locally
# and in CI. Arguments go to `playwright test`, e.g. `--update-snapshots` or a file filter.
set -eu

ROOT=$(cd "$(dirname "$0")/../../.." && pwd)
VERSION=$(node -p "require('$ROOT/apps/storybook/node_modules/@playwright/test/package.json').version")
IMAGE="mcr.microsoft.com/playwright:v$VERSION-noble"

# Docker runs as root by default: map to the current user so reports and screenshots stay
# yours. Podman (also behind a `docker` alias) and rootless Docker already map root in the
# container to the current user.
USER_FLAG=""
if ! docker info 2>/dev/null | grep -qiE 'podman|rootless'; then
  USER_FLAG="--user $(id -u):$(id -g)"
fi

TTY_FLAG=""
if [ -t 1 ]; then TTY_FLAG="-t"; fi

# shellcheck disable=SC2086
exec docker run --rm --init --ipc=host $TTY_FLAG $USER_FLAG \
  -e CI -e HOME=/tmp -e PLAYWRIGHT_DOCKER=1 \
  -v "$ROOT":/work -w /work/apps/storybook \
  "$IMAGE" ./node_modules/.bin/playwright test "$@"
