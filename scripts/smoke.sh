#!/usr/bin/env bash
# Builds and starts the whole stack, then checks the API and the app answer on :8000.
set -euo pipefail
cd "$(dirname "$0")/.."
docker compose up -d --build
for _ in $(seq 1 90); do
  if curl -fs localhost:8000/api/health >/dev/null; then break; fi
  sleep 1
done
curl -fs localhost:8000/api/health | grep -q '"ok":true' || { echo "api health failed"; docker compose logs api | tail -40; exit 1; }
curl -fs localhost:8000/ | grep -q '<div id="root">' || { echo "app shell missing"; exit 1; }
curl -fs localhost:8000/scan/some-job | grep -q '<div id="root">' || { echo "SPA fallback missing"; exit 1; }
echo "smoke ok"
