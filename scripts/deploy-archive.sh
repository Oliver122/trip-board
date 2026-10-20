#!/usr/bin/env bash
# Write the checked-out commit as a tar stream with a REVISION file.
# Refuses when tracked files have uncommitted changes. Untracked files are never included.
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)

changes=$(git -C "$root" status --porcelain --untracked-files=no)
if [[ -n $changes ]]; then
  count=$(printf '%s\n' "$changes" | grep -c '')
  echo "Refusing to deploy: ${count} uncommitted change(s). Commit or stash them first." >&2
  printf '%s\n' "$changes" >&2
  exit 1
fi

revision=$(git -C "$root" rev-parse HEAD)
echo "Deploying $(git -C "$root" log -1 --format='%h %s')" >&2

short=$(git -C "$root" log -1 --format=%h)
if ! git -C "$root" rev-parse --verify --quiet origin/main > /dev/null ||
  ! git -C "$root" merge-base --is-ancestor HEAD origin/main; then
  echo "Warning: ${short} is not on origin/main; CI has not checked it." >&2
fi

stage=$(mktemp -d)
trap 'rm -rf "$stage"' EXIT
# mktemp -d is 0700; the top-level entry would set that mode on the deploy path.
chmod 755 "$stage"
git -C "$root" archive --format=tar HEAD | tar -x -C "$stage"
printf '%s\n' "$revision" > "$stage/REVISION"
tar -C "$stage" -cf - .
