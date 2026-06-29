# LLMeter (desktop app prototype)

A desktop app that adds a **projects + context** layer on top of local LLMs, the way Claude Projects does. Create a project, give it instructions, attach reference docs (auto-summarized), and chat. Reference summaries plus instructions are injected as a system prompt on every message.

This prototype targets **local Ollama** models. Cloud providers via API keys (Claude, OpenAI) are on the roadmap and slot in as additional backends behind the same chat flow.

Sign-in (email/password, Google, GitHub) is handled by the NestJS service in `../auth-backend`. Start that backend first; the app gates the projects view behind login. Point the app at a non-default backend with `LLMETER_API_URL` (default `http://localhost:${process.env.PORT}`).

## Requirements

- [Bun](https://bun.sh) 1.1+ (package manager + script runner)
- [Ollama](https://ollama.com) running locally, with a chat model and an embedding model pulled:
  ```
  ollama pull llama3.2          # chat / generation
  ollama pull nomic-embed-text  # embeddings for retrieval (RAG)
  ```
  Ollama serves on `http://127.0.0.1:11434` by default. Override with `OLLAMA_HOST`.
  Override the embedding model with `LLMETER_EMBED_MODEL`.
  If no embedding model is present, references fall back to summary-only context.

## Run

```
cd app
bun install
bun start
```

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
  main.js              Electron main: window + IPC bootstrap
  preload.js           contextBridge API (incl. streaming chat)
  src/main/
    auth.js            Backend auth client: token storage, refresh, OAuth popup
    ollama.js          Ollama client: status, models, generate, embed, chatStream
    store.js           Project persistence (JSON in userData) + vector-stripped public view
    rag.js             Chunking, cosine similarity, top-k retrieval
    context.js         Ingest (chunk+embed), retrieval, system-prompt assembly
    ipc.js             IPC handlers wiring it together
  src/renderer/
    index.html         UI shell
    styles.css         Styles
    js/
      auth.js          Login/signup screen, OAuth buttons, auth gate
      dom.js           DOM helpers
      state.js         Renderer state
      views.js         Pure render functions
      chat.js          Chat send + streaming
      projects.js      Project CRUD, autosave, context
      app.js           Bootstrap + event binding
```

## Roadmap (see the project plan doc)

- API-key backends: Claude, OpenAI, others, selectable per project.
- Persist embeddings in a vector store (e.g. SQLite) instead of the project JSON.
- Wire the app to the LLMeter router daemon so projects share one model store.
