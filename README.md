# LLMeter

A local-first LLM workspace: create projects, attach reference docs that are chunked and embedded for retrieval, and chat with local Ollama models, all behind one account. Built as two parts:

- `app/` — Electron desktop app in TypeScript. Projects, RAG context, streaming chat, login UI, the local OpenAI-compatible proxy, and the governance API itself. Compiled with `tsc` into `app/dist/`.
- `firebase/` — Firebase Auth + Firestore on the free Spark plan, plus security rules and a single hosted sign-in page. See `firebase/README.md`.

There is no server. Cloud Functions requires the paid Blaze plan, so the
service logic runs inside the app and talks to Firestore directly under the
signed-in user's ID token. `firebase/firestore.rules` is the authorization
layer, and it is worth reading before changing anything in `app/src/main/api/`.

`auth-backend/` is the retired NestJS service. It is kept only as a reference
for the migration and is no longer started or shipped.

The original architecture write-up is in `LLMeter_Project_Plan.docx`.

## Prerequisites

- [Bun](https://bun.sh) 1.1+ (package manager + script runner)
- [Ollama](https://ollama.com) running locally, with models pulled:
  ```
  ollama pull llama3.2          # chat
  ollama pull nomic-embed-text  # embeddings (RAG)
  ```

## Quick start

First-time setup (installs both projects, creates the DB):

```
./scripts/setup.sh
```

Then run the app:

```
./scripts/dev.sh
```

Nothing to start first. The OpenAI-compatible endpoint runs inside the app on
`http://127.0.0.1:3227/v1`.

To work against the Firebase emulators instead of a live project:

```
./scripts/dev.sh --emulator
```

## Manual steps

See `firebase/README.md` for project setup, and `app/README.md` for the app.
In short:

```
cd firebase && firebase deploy    # rules, indexes, sign-in page

cd ../app
cp .env.example .env              # Firebase project id + web API key
bun install
bun start
```

## Configuration and secrets

| File | Contents | Ships in the app? |
| --- | --- | --- |
| `app/.env` | Firebase project id, web API key, public OAuth client ids, local service hosts | **Yes** — treat as public |
| `.env.example` (repo root) | Code-signing + GitHub release credentials | No — CI environment only |

There is no third file any more. The provider client secrets for Google and
GitHub sign-in live inside the Firebase project, where its hosted OAuth handler
uses them; the Outlook connector uses a public client with PKCE and has no
secret at all.

`app/scripts/build-env.js` compiles `app/.env` into the bundle and refuses to run
if a key matching `SECRET` / `PASSWORD` / `PRIVATE` / `*_TOKEN` / `CSC_*` /
`APPLE_*` appears there. The signed-in user's own tokens are never written in
plaintext: `app/src/main/token-store.ts` encrypts them through the OS keystore
(Keychain / DPAPI / libsecret), falling back to a 0600 file only where no
keyring exists.

## What enforcement does and does not guarantee

Firestore rules stop a user raising their own token limit, editing org policy
without the role for it, reading a colleague's prompts, or rewriting usage
history. They cannot compel a client to report its usage at all, so limits are
cooperative rather than adversarial-proof.

That trade is deliberate and bounded: anyone who can patch the app can also run
Ollama directly and bypass AnyLM entirely. `app/src/main/api/index.ts` keeps
REST-shaped paths precisely so a server can be reintroduced behind the same
seam if enforcement ever has to survive a hostile client. `firebase/README.md`
has the details.

## Verification status

The desktop app typechecks clean under both `tsconfig.main.json` and
`tsconfig.renderer.json` (`bun run typecheck` in `app/`). The governance logic
is a direct port of the NestJS services that were previously exercised end to
end, but the Firestore paths and the security rules have not yet been run
against a live project. Treat the first deploy as the real test, and exercise
the rules with the emulator's rules-testing harness before trusting them.

The RAG layer keeps its unit tests for chunking, cosine similarity, ranked
retrieval, and the summary fallback.
