#!/usr/bin/env bash
# Write the CI deploy env file and ssh key. Does not open a connection.
set -euo pipefail

if [[ -z ${RUNNER_TEMP:-} ]]; then
  echo "RUNNER_TEMP is not set." >&2
  exit 1
fi

required=(
  DEPLOY_HOST
  DEPLOY_USER
  DEPLOY_PATH
  WEB_ORIGIN
  DEPLOY_SSH_PRIVATE_KEY
  DEPLOY_KNOWN_HOSTS
)

missing=()
for key in "${required[@]}"; do
  value=${!key-}
  if [[ -z ${value//[[:space:]]/} ]]; then
    missing+=("$key")
  fi
done
if ((${#missing[@]})); then
  echo "Missing required production settings: ${missing[*]}" >&2
  exit 1
fi

umask 077
key_file="$RUNNER_TEMP/deploy_key"
env_file="$RUNNER_TEMP/deploy.env"
printf '%s\n' "$DEPLOY_SSH_PRIVATE_KEY" >"$key_file"
chmod 600 "$key_file"

mkdir -p "$HOME/.ssh"
chmod 700 "$HOME/.ssh"
printf '%s\n' "$DEPLOY_KNOWN_HOSTS" >"$HOME/.ssh/known_hosts"
chmod 600 "$HOME/.ssh/known_hosts"

written=(
  DEPLOY_HOST
  DEPLOY_USER
  DEPLOY_PATH
  WEB_ORIGIN
  DISCORD_CLIENT_ID
  DISCORD_CLIENT_SECRET
  AUTH_SECRET
  DATABASE_URL
  ADMIN_DISCORD_IDS
  ADMIN_DISCORD_WEBHOOK_URL
  S3_ENDPOINT
  S3_BUCKET
  S3_REGION
  S3_ACCESS_KEY
  S3_SECRET_KEY
  NOMINATIM_BASE_URL
  NOMINATIM_USER_AGENT
  WEB_PORT
  API_PORT
)

: >"$env_file"
chmod 600 "$env_file"
for key in "${written[@]}"; do
  value=${!key-}
  if [[ -n $value ]]; then
    printf '%s=%q\n' "$key" "$value" >>"$env_file"
  fi
done
printf '%s=%q\n' DEPLOY_SSH_KEY "$key_file" >>"$env_file"
