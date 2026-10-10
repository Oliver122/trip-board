#!/usr/bin/env bash
# Run the Playwright suite in the official Playwright image, the way CI does:
# fresh Postgres and MinIO, a seeded database, a built web app for Lighthouse,
# and Firefox headed under Xvfb with software GL (headless Firefox has no WebGL).
#
#   bash scripts/run-e2e-tests.sh                      # every project
#   bash scripts/run-e2e-tests.sh --project=firefox    # extra args go to playwright test
#   bash scripts/run-e2e-tests.sh e2e/cleanup.spec.ts --project=firefox
#
# Everything runs on its own Docker network, so the dev `docker compose` stack
# and a dev server on 5180/4080 can keep running. The local .env is hidden from
# the container, as in CI, so only the variables below apply.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

if [ ! -d node_modules ]; then
  echo "Run pnpm install first." >&2
  exit 1
fi

pw_version="$(node -p "require('@playwright/test/package.json').version")"
pnpm_version="$(node -p "require('./package.json').packageManager.split('@')[1]")"
image="tripboard-e2e:${pw_version}"
network="tripboard-e2e"
postgres="tripboard-e2e-postgres"
minio="tripboard-e2e-minio"
runner="tripboard-e2e-runner"

cleanup() {
  docker rm -f "$runner" "$postgres" "$minio" >/dev/null 2>&1 || true
  docker network rm "$network" >/dev/null 2>&1 || true
}
trap cleanup EXIT
cleanup

docker build -q -t "$image" \
  --build-arg PLAYWRIGHT_VERSION="$pw_version" \
  --build-arg PNPM_VERSION="$pnpm_version" \
  -f scripts/e2e.Dockerfile scripts >/dev/null

docker network create "$network" >/dev/null

docker run -d --name "$postgres" --network "$network" --tmpfs /var/lib/postgresql/data \
  -e POSTGRES_USER=tripboard -e POSTGRES_PASSWORD=tripboard -e POSTGRES_DB=tripboard \
  postgres:16 >/dev/null

docker run -d --name "$minio" --network "$network" \
  -e MINIO_ROOT_USER=tripboard -e MINIO_ROOT_PASSWORD=tripboard-secret \
  cgr.dev/chainguard/minio:latest server /data --console-address :9001 >/dev/null

for _ in $(seq 1 60); do
  if docker exec "$postgres" pg_isready -U tripboard -d tripboard >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
docker exec "$postgres" pg_isready -U tripboard -d tripboard >/dev/null || {
  echo "Postgres did not become ready." >&2
  exit 1
}

tty_flag=()
[ -t 1 ] && tty_flag=(-t)

# CI=1 gives the CI behaviour: one retry, a fresh web server, and no reuse of a
# dev server. The list reporter replaces CI's blob/github reporters.
docker run --rm -i "${tty_flag[@]}" \
  --name "$runner" \
  --network "$network" \
  --ipc=host \
  --user "$(id -u):$(id -g)" \
  -e HOME=/tmp \
  -e CI=1 \
  -e DATABASE_URL=postgres://tripboard:tripboard@${postgres}:5432/tripboard \
  -e WEB_PORT=5180 \
  -e API_PORT=4080 \
  -e WEB_ORIGIN=http://127.0.0.1:5180 \
  -e DISCORD_CLIENT_ID=ci-client \
  -e DISCORD_CLIENT_SECRET=ci-secret \
  -e AUTH_SECRET=ci-auth-secret-value \
  -e REQUIRE_DB=1 \
  -e S3_ENDPOINT=http://${minio}:9000 \
  -e S3_BUCKET=tripboard \
  -e S3_ACCESS_KEY=tripboard \
  -e S3_SECRET_KEY=tripboard-secret \
  -e S3_REGION=us-east-1 \
  -e FIREFOX_HEADED=1 \
  -e LIBGL_ALWAYS_SOFTWARE=1 \
  -e GALLIUM_DRIVER=llvmpipe \
  -v "$root:/work" \
  -v /dev/null:/work/.env:ro \
  "$image" \
  bash -c '
    set -euo pipefail
    pnpm db:migrate
    pnpm db:seed
    pnpm --filter @tripboard/web build
    xvfb-run -a pnpm exec playwright test --reporter=list "$@"
  ' run-e2e "$@"
