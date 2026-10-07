#!/usr/bin/env bash
# Upload the working tree and restart Trip Board.
# Connection and the values written into the server .env come from deploy.env.
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)

if [[ ${1:-} == --apply-env ]]; then
  bash "$root/scripts/server-env.sh"
  exit $?
fi

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

if command -v zypper >/dev/null; then
  zypper --non-interactive install git curl tar xz python3 docker docker-compose nginx
elif command -v apt-get >/dev/null; then
  apt-get update
  apt-get install -y git curl tar xz-utils python3 docker.io docker-compose-v2 nginx
else
  echo "Install Docker, nginx, and curl on this server first." >&2
  exit 1
fi
systemctl enable --now docker
systemctl enable --now nginx

if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q /swapfile /etc/fstab || echo "/swapfile none swap sw 0 0" >> /etc/fstab
fi

if ! node -v 2>/dev/null | grep -q '^v22\.'; then
  file=$(curl -fsSL https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt | awk '/node-v22\..*-linux-x64\.tar\.xz/{print $2; exit}')
  curl -fsSL "https://nodejs.org/dist/latest-v22.x/${file}" -o /tmp/node.tar.xz
  tar -xJf /tmp/node.tar.xz -C /usr/local --strip-components=1
  rm /tmp/node.tar.xz
  corepack enable
  corepack prepare pnpm@10.15.1 --activate
fi

if ! grep -Rqs "127.0.0.1:5180" /etc/nginx; then
  python3 - << 'NGINX'
from pathlib import Path
path = Path("/etc/nginx/nginx.conf")
text = path.read_text()
text = text.replace(
    "        listen       80;\n        server_name  localhost;",
    "        listen 80 default_server;\n        listen [::]:80 default_server;\n        server_name _;",
    1,
)
text = text.replace(
    """        location / {
            root   /srv/www/htdocs/;
            index  index.html index.htm;
        }""",
    """        location / {
            proxy_pass http://127.0.0.1:5180;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
        }""",
    1,
)
path.write_text(text)
NGINX
fi
nginx -t
systemctl reload nginx
if systemctl is-active --quiet firewalld; then
  firewall-cmd --permanent --add-service=http
  firewall-cmd --reload
fi

mkdir -p "$DEPLOY_PATH"
cat > /etc/systemd/system/trip-board.service << EOF
[Unit]
Description=Trip Board
After=docker.service network-online.target
Requires=docker.service

[Service]
WorkingDirectory=${DEPLOY_PATH}
Environment=PATH=/usr/local/bin:/usr/bin:/bin
ExecStart=/usr/local/bin/pnpm dev
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable trip-board

cd "$DEPLOY_PATH"

if [[ ! -f .env ]]; then
  cp .env.example .env
fi

bash scripts/server-env.sh

python3 - << 'PY'
from pathlib import Path

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
