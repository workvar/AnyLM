#!/usr/bin/env bash
# Run the desktop app.
#
# There is no local backend to start any more. Auth and data are Firebase, and
# both the governance API and the OpenAI-compatible proxy run inside the
# Electron main process. This script exists mainly to offer the emulator path
# for work on the Firestore rules.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [ "$1" = "--emulator" ]; then
  echo "==> Starting Firebase emulators"
  cd "$ROOT/firebase"
  firebase emulators:start --only firestore,auth,hosting &
  EMU_PID=$!
  trap 'kill "$EMU_PID" 2>/dev/null || true' EXIT INT TERM

  echo "==> Waiting for the hosting emulator on :5000"
  for _ in $(seq 1 60); do
    curl -s http://127.0.0.1:5000/ >/dev/null 2>&1 && break
    sleep 1
  done

  echo "==> Starting desktop app against the emulator"
  cd "$ROOT/app"
  ANYLM_SITE_URL="http://127.0.0.1:5000" bun start
  exit 0
fi

echo "==> Starting desktop app"
cd "$ROOT/app"
bun start
