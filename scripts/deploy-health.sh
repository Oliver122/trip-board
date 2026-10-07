#!/usr/bin/env bash
# Poll the public health endpoint after deploy.sh returns.
set -euo pipefail

if [[ -z ${WEB_ORIGIN:-} ]]; then
  echo "Missing required production settings: WEB_ORIGIN" >&2
  exit 1
fi

origin=${WEB_ORIGIN%/}
deadline=$((SECONDS + 60))
body_file=${RUNNER_TEMP:-/tmp}/health.json
ok=0
while ((SECONDS < deadline)); do
  code=$(curl -sS -o "$body_file" -w '%{http_code}' --max-time 5 "$origin/api/health" || true)
  if [[ $code == 200 ]] && python3 - "$body_file" <<'PY'
import json
import sys

data = json.load(open(sys.argv[1]))
sys.exit(0 if data.get("status") == "ok" and data.get("db") == "ok" else 1)
PY
  then
    ok=1
    break
  fi
  sleep 2
done

if [[ $ok != 1 ]]; then
  echo "Health check failed for ${origin}/api/health" >&2
  exit 1
fi

if [[ -n ${GITHUB_STEP_SUMMARY:-} ]]; then
  {
    echo "### Deploy"
    echo
    echo "Commit \`$GITHUB_SHA\`"
    echo
    echo '```json'
    cat "$body_file"
    echo
    echo '```'
  } >>"$GITHUB_STEP_SUMMARY"
fi
