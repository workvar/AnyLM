# Contributing to AnyLM

Thanks for helping. AnyLM is a local-first desktop workspace for Ollama models, plus a small marketing site that serves downloads from GitHub Releases.

## Repository layout

| Path | What it is |
| --- | --- |
| `app/` | Electron desktop app (Bun + TypeScript) |
| `web/` | Marketing / download site (Next.js) |
| `firebase/` | Auth, Firestore rules, hosted sign-in page |
| `docs/` | Specs, release notes, launch kit |
| `auth-backend/` | Retired NestJS reference — do not ship |

## Development

Prerequisites: [Bun](https://bun.sh) 1.1+, [Ollama](https://ollama.com) with a chat model and `nomic-embed-text`.

```bash
./scripts/setup.sh
./scripts/dev.sh
```

App only:

```bash
cd app
cp .env.example .env   # Firebase project id + web API key
bun install
bun start
```

Site only:

```bash
cd web
npm install
npm run dev
```

## Before you open a PR

1. Keep changes focused — one concern per PR.
2. In `app/`: `bun run typecheck` (and `bun test` when you touch tested code).
3. In `web/`: `npm run typecheck`.
4. Do not commit secrets. `app/.env` is public-shaped config only; CI signing tokens stay in the environment (see root `.env.example`).
5. Prefer updating or adding a short note under `docs/releases/` when user-facing behavior changes in a release.

## Design docs

Larger features usually start as a short design under `docs/superpowers/specs/` and a plan under `docs/superpowers/plans/`. Match that pattern for non-trivial work.

## License

By contributing, you agree your contributions are licensed under the MIT License in `LICENSE`.
