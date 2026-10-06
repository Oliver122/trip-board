#!/usr/bin/env bash
# Upload the working tree and restart Trip Board.
# Connection and the values written into the server .env come from deploy.env.
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
env_file=${DEPLOY_ENV:-$root/deploy.env}

if [[ ! -f $env_file ]]; then
  echo "Missing $env_file. Copy deploy.env.example to deploy.env and fill it in." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$env_file"
set +a

: "${DEPLOY_HOST:?Set DEPLOY_HOST in deploy.env}"
: "${DEPLOY_USER:?Set DEPLOY_USER in deploy.env}"
: "${DEPLOY_PATH:?Set DEPLOY_PATH in deploy.env}"
: "${WEB_ORIGIN:?Set WEB_ORIGIN in deploy.env}"

app_keys=(
  WEB_ORIGIN
  WEB_PORT
  API_PORT
  DATABASE_URL
  DISCORD_CLIENT_ID
  DISCORD_CLIENT_SECRET
  AUTH_SECRET
  ADMIN_DISCORD_IDS
  ADMIN_DISCORD_WEBHOOK_URL
  NOMINATIM_BASE_URL
  NOMINATIM_USER_AGENT
  S3_ENDPOINT
  S3_BUCKET
  S3_ACCESS_KEY
  S3_SECRET_KEY
  S3_REGION
)

remote_env=()
for key in "${app_keys[@]}"; do
  value=${!key-}
  if [[ -n $value ]]; then
    remote_env+=("$(printf '%q=%q' "$key" "$value")")
  fi
done

ssh_opts=(-o StrictHostKeyChecking=accept-new)
if [[ -n ${DEPLOY_SSH_KEY:-} ]]; then
  ssh_opts+=(-i "$DEPLOY_SSH_KEY")
fi
remote="${DEPLOY_USER}@${DEPLOY_HOST}"

echo "Uploading to ${remote}:${DEPLOY_PATH}"
tar -C "$root" -cf - \
  --exclude node_modules \
  --exclude dist \
  --exclude .git \
  --exclude .env \
  --exclude deploy.env \
  --exclude coverage \
  --exclude test-results \
  --exclude playwright-report \
  --exclude blob-report \
  . | ssh "${ssh_opts[@]}" "$remote" "mkdir -p $(printf '%q' "$DEPLOY_PATH") && tar -xf - -C $(printf '%q' "$DEPLOY_PATH")"

echo "Updating server .env and restarting"
ssh "${ssh_opts[@]}" "$remote" "DEPLOY_PATH=$(printf '%q' "$DEPLOY_PATH") ${remote_env[*]} bash -s" << 'REMOTE'
set -euo pipefail
cd "$DEPLOY_PATH"

if [[ ! -f .env ]]; then
  cp .env.example .env
fi

python3 - << 'PY'
import os
from pathlib import Path

keys = [
    "WEB_ORIGIN",
    "WEB_PORT",
    "API_PORT",
    "DATABASE_URL",
    "DISCORD_CLIENT_ID",
    "DISCORD_CLIENT_SECRET",
    "AUTH_SECRET",
    "ADMIN_DISCORD_IDS",
    "ADMIN_DISCORD_WEBHOOK_URL",
    "NOMINATIM_BASE_URL",
    "NOMINATIM_USER_AGENT",
    "S3_ENDPOINT",
    "S3_BUCKET",
    "S3_ACCESS_KEY",
    "S3_SECRET_KEY",
    "S3_REGION",
]
path = Path(".env")
lines = path.read_text().splitlines()
updated = set()
out = []
for line in lines:
    key = line.split("=", 1)[0]
    if key in keys and os.environ.get(key):
        out.append(f"{key}={os.environ[key]}")
        updated.add(key)
    else:
        out.append(line)
for key in keys:
    value = os.environ.get(key)
    if value and key not in updated:
        out.append(f"{key}={value}")
path.write_text("\n".join(out) + "\n")

compose = Path("docker-compose.yml")
text = compose.read_text()
text = text.replace("- '5432:5432'", "- '127.0.0.1:5432:5432'")
text = text.replace("- '9000:9000'", "- '127.0.0.1:9000:9000'")
text = text.replace("- '9001:9001'", "- '127.0.0.1:9001:9001'")
compose.write_text(text)
PY

docker compose up -d
export PATH="/usr/local/bin:/usr/bin:/bin"
pnpm install --frozen-lockfile
pnpm db:migrate
if systemctl cat trip-board.service >/dev/null 2>&1; then
  systemctl restart trip-board
else
  echo "trip-board.service is not installed. Start the app with: pnpm dev" >&2
  exit 1
fi

for _ in $(seq 1 30); do
  if curl -sf http://127.0.0.1:5180/api/health >/dev/null; then
    curl -sf http://127.0.0.1:5180/api/health
    echo
    exit 0
  fi
  sleep 1
done
echo "App did not become healthy." >&2
journalctl -u trip-board --no-pager -n 40 >&2
exit 1
REMOTE
