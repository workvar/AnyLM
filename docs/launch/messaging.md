# Messaging

Use this sheet so Product Hunt, HN, Reddit, and the repo README stay aligned.

## Product in one sentence

AnyLM is a local-first desktop workspace for Ollama models: projects with RAG, multi-agent chat, and one OpenAI-compatible endpoint every local app can share — nothing leaves your machine for inference.

## Taglines (pick by character limit)

| Limit | Line |
| --- | --- |
| ≤60 (Product Hunt) | Local LLM workspace. One endpoint. Zero cloud. |
| ≤60 alt | Projects, RAG, and a local OpenAI API for Ollama. |
| Short | One endpoint for every local model. |
| Brand | One router. Every model. Zero duplication. |
| Privacy | Local-first · nothing leaves your machine. |

## Elevator (≈40 words)

AnyLM sits on top of the models you already run with Ollama. Create projects, attach docs for retrieval, chat with streaming and multi-agent runs, and point Cursor, Continue, or your own scripts at a single local OpenAI-compatible API — without sending prompts to the cloud.

## Value pillars

1. **Local by default** — inference stays on-device via Ollama.
2. **Projects with real context** — references are chunked, embedded, and retrieved.
3. **One endpoint for every app** — OpenAI-compatible proxy on `127.0.0.1` so tools share one runtime.
4. **Desktop that ships** — macOS, Windows, and Linux installers; auto-update from GitHub Releases.
5. **Governance-ready** — accounts, orgs, and usage policy for teams that need guardrails later.

## Audience

Primary: developers and local-AI power users on Mac/Windows/Linux who already use Ollama and hate juggling duplicate model loads, cloud chat for private work, or project-less chat UIs.

Secondary: small teams that want local inference with light org policy.

## Competitive framing (honest)

| vs | Say |
| --- | --- |
| Ollama | We sit on top: projects, RAG, desktop UX, governance. Ollama remains the runtime. |
| LM Studio / Jan / GPT4All | Peer desktop apps; we emphasize project context, shared local API, and org policy. |
| Cloud ChatGPT / Claude | Different category — privacy and offline cost, not frontier model quality. |

Avoid claiming cross-runtime MLX/vLLM dedup or a system tray daemon until those ship. Market the product that exists in v0.4.x.

## Keywords / topics

`local llm` · `ollama` · `rag` · `openai compatible` · `desktop ai` · `privacy` · `multi agent` · `open source` · `electron`

## FAQ (short answers)

**Do my prompts leave my computer?**  
Inference runs through local Ollama. Account sign-in uses Firebase; chat content is stored on your machine.

**Do I need an API key for models?**  
No for local Ollama models. Pull models with Ollama, then use them in AnyLM.

**Is it free / open source?**  
Yes — MIT licensed. Desktop builds are free to download.

**What platforms?**  
macOS (Apple Silicon + Intel), Windows, Linux (AppImage).

**How do other apps talk to it?**  
Enable the local proxy (default `http://127.0.0.1:3227/v1`) and use an `anylm_` API key from the app.
