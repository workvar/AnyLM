# LLMeter (desktop app prototype)

A desktop app that adds a **projects + context** layer on top of local LLMs, the way Claude Projects does. Create a project, give it instructions, attach reference docs (auto-summarized), and chat. Reference summaries plus instructions are injected as a system prompt on every message.

This prototype targets **local Ollama** models. Cloud providers via API keys (Claude, OpenAI) are on the roadmap and slot in as additional backends behind the same chat flow.

Sign-in (email/password, Google, GitHub) is handled by Firebase Auth, with orgs, policies and usage limits served by Cloud Functions in `../firebase`. Nothing has to be started locally first. Project coordinates live in `app/.env` (copy `.env.example`); point the app at a different project or the emulator by changing `ANYLM_FIREBASE_PROJECT`, `ANYLM_FIREBASE_API_KEY`, and `ANYLM_SITE_URL` there.

The app also serves an OpenAI-compatible endpoint on `http://127.0.0.1:3227/v1` so other local tools can route through AnyLM's governance. It authenticates with `anylm_` API keys, not your session. Toggle it with the `proxyEnabled` and `proxyPort` settings.

## Requirements

- [Bun](https://bun.sh) 1.1+ (package manager + script runner)
- [Ollama](https://ollama.com) running locally, with a chat model and an embedding model pulled:
  ```
  ollama pull llama3.2          # chat / generation
  ollama pull nomic-embed-text  # embeddings for retrieval (RAG)
  ```
  Ollama serves on `http://127.0.0.1:11434` by default. Override with `OLLAMA_HOST`
  or `ANYLM_OLLAMA_HOST` in `.env`; override the embedding model with `ANYLM_EMBED_MODEL`.
  If no embedding model is present, references fall back to summary-only context.

## Run

```
cd app
cp .env.example .env      # fill in the Firebase project id + web API key
bun install
bun start                 # compiles TypeScript, then launches Electron
```

## Configuration

Build-time configuration lives in `app/.env` and is compiled into
`src/main/env.generated.ts` by `scripts/build-env.js`. **Everything in that file
ships inside the app bundle, so treat it as public.** An allowlist in
`scripts/env-schema.js` decides what is permitted; the build fails outright if a
key matching `SECRET` / `PASSWORD` / `PRIVATE` / `*_TOKEN` / `CSC_*` / `APPLE_*`
turns up in `app/.env`.

The Firebase web API key is in the allowlist because it is a project identifier,
not a credential: it authorizes nothing on its own, `firestore.rules` denies all
direct client access, and every read and write goes through the `api` Cloud
Function.

Real secrets live elsewhere:

| Secret | Home |
| --- | --- |
| Connector OAuth client secrets | `firebase/functions/.env` (or Secret Manager) |
| Code-signing + publishing tokens | CI environment, see `../.env.example` |
| The signed-in user's own tokens | OS keystore at runtime, via `src/main/token-store.ts` |

## Build

The app is TypeScript, compiled with `tsc` into `dist/` and shipped from there.

| Command | Does |
| --- | --- |
| `bun run build` | env injection → main → renderer → copy static assets |
| `bun run typecheck` | both projects, `--noEmit` |
| `bun run start` | build, then launch Electron |
| `bun run dist` | build, then package with electron-builder |
| `bun run clean` | remove `dist/` and the generated env module |

Two tsconfigs, because the two halves need different module systems:

- `tsconfig.main.json` — main process + preload, **CommonJS**, Node types, emits
  `dist/main.js`, `dist/preload.js`, `dist/src/main/**`.
- `tsconfig.renderer.json` — renderer, **ES modules**, DOM types, emits
  `dist/renderer/js/**` next to the copied `index.html` and `styles.css`.

Shared types are ambient `.d.ts` files in `src/types/`, so both halves see them
without either config reaching across its `rootDir`:

- `domain.d.ts` — projects, threads, messages, policies, settings
- `api.d.ts` — the `window.api` IPC contract that `preload.ts` implements and the
  renderer consumes, so a rename on either side is a compile error
- `dom.d.ts` — `UiElement`, the widened element type the DOM helpers return

## What works

- Create / rename / delete projects (saved to disk in Electron's userData dir).
- Per-project instructions (system prompt).
- Add text references (`.txt .md .json .csv .log`). On add, each doc is chunked and embedded (and a short summary is stored for display).
- Retrieval-augmented chat: each message embeds your query, retrieves the top-k most relevant chunks across the project's references, and injects them (with source names) into the system prompt. Falls back to summaries if no embedding model is available.
- Streaming chat against the project's selected Ollama model.
- Live Ollama status indicator and model list.

## Layout

```
app/
  .env                 Build-time config (gitignored; see .env.example)
  main.ts              Electron main: window + IPC bootstrap
  preload.ts           contextBridge API, typed against AnyLmApi
  tsconfig.main.json   Main process build (CommonJS)
  tsconfig.renderer.json  Renderer build (ES modules)
  scripts/
    build-env.js       .env -> src/main/env.generated.ts, with the secret guard
    env-schema.js      What may and may not be baked into the bundle
    read-env-file.js   Minimal .env parser (no dotenv dependency)
    copy-assets.js     index.html + styles.css -> dist/renderer
  src/types/
    domain.d.ts        Shared domain types (ambient)
    api.d.ts           The window.api IPC contract (ambient)
    dom.d.ts           UiElement, the widened DOM element type (ambient)
  src/main/
    env.ts             Resolved build config (env.generated + process.env)
    auth.ts            Auth client: API calls, refresh, OAuth flow
    token-store.ts     Token persistence, encrypted via Electron safeStorage
    ollama.ts          Ollama client: status, models, generate, embed, chatStream
    store.ts           Project persistence (JSON in userData) + public view
    rag.ts             Chunking, cosine similarity, top-k retrieval
    context.ts         Ingest (chunk+embed), retrieval, system-prompt assembly
    ipc.ts             IPC handlers wiring it together
  src/renderer/
    index.html         UI shell
    styles.css         Styles
    js/
      auth.ts          Login/signup screen, OAuth buttons, auth gate
      dom.ts           DOM helpers (el, qs, qsa, target, node)
      state.ts         Renderer state
      views.ts         Pure render functions
      chat.ts          Chat send + streaming
      projects.ts      Project CRUD, autosave, context
      app.ts           Bootstrap + event binding
  dist/                Build output (gitignored); package.json "main" points here
```

## Roadmap (see the project plan doc)

- API-key backends: Claude, OpenAI, others, selectable per project.
- Persist embeddings in a vector store (e.g. SQLite) instead of the project JSON.
- Wire the app to the LLMeter router daemon so projects share one model store.
