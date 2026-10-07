#!/usr/bin/env bash
# Merge deploy settings into the server .env in the current directory.
# DEV_LOGIN is never written. DEV_LOGIN=1 stops the deploy before a restart.
set -euo pipefail

python3 - << 'PY'
import os
import sys
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
if not path.is_file():
    print("Missing .env", file=sys.stderr)
    sys.exit(1)
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
text = "\n".join(out) + "\n"
path.write_text(text)

for line in text.splitlines():
    raw = line.split("#", 1)[0].strip()
    if "=" not in raw:
        continue
    key, value = raw.split("=", 1)
    cleaned = value.strip().strip('"').strip("'")
    if key.strip() == "DEV_LOGIN" and cleaned == "1":
        print("Refusing to restart: server .env sets DEV_LOGIN=1.", file=sys.stderr)
        sys.exit(1)
PY
