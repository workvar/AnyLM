#!/usr/bin/env bash
# First-time setup for AnyLM.
#
# There is nothing to install for the backend, because there is no backend.
# Auth and data are Firebase (free Spark plan); the governance logic and the
# local OpenAI-compatible endpoint both run inside the desktop app.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> Installing desktop app"
cd "$ROOT/app"
bun install
# Build-time config for the app. Everything in here is baked into the bundle,
# so it holds project identifiers only; see app/.env.example.
[ -f .env ] || cp .env.example .env

cd "$ROOT/firebase"
[ -f .firebaserc ] || cp .firebaserc.example .firebaserc

echo ""
echo "Setup complete. Next:"
echo "  1. Create a Firebase project (stay on the free Spark plan) and put"
echo "     its id in firebase/.firebaserc"
echo "  2. Register a Web app in Project settings > Your apps"
echo "  3. Enable Authentication providers: Email/Password, Google, GitHub"
echo "  4. Create the Firestore database in Native mode"
echo "  5. Put the project id + web API key in app/.env"
echo "  6. cd firebase && firebase deploy"
echo ""
echo "Details in firebase/README.md."
echo "For local work without deploying: ./scripts/dev.sh --emulator"
