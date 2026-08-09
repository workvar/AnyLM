# Social & community posts

Copy-paste drafts. Adjust links if the Product Hunt URL is known (`https://www.producthunt.com/posts/anylm` once live).

---

## Hacker News (Show HN)

**Title**

Show HN: AnyLM – local LLM workspace with projects, RAG, and an OpenAI-compatible API

**Body**

AnyLM is an open-source desktop app (macOS / Windows / Linux) that sits on top of Ollama.

I wanted two things: (1) project-scoped instructions and document RAG like “Claude Projects,” but fully local; (2) one OpenAI-compatible endpoint so Cursor, Continue, and scripts share a single resident runtime instead of each loading their own copy of the weights.

What works today (v0.4):

- Projects + chunk/embed/retrieve over attached docs  
- Streaming chat, reasoning tokens, multi-agent orchestration  
- Local proxy at 127.0.0.1 with anylm_ API keys  
- Installers from GitHub Releases; site at https://anylm.app  

Stack: Electron + TypeScript, Ollama for inference, Firebase Auth/Firestore for accounts (inference stays local).

Site: https://anylm.app  
Download: https://anylm.app/download  
Source: https://github.com/workvar/AnyLM  

Happy to answer questions about the RAG path, the proxy, or the multi-agent bits.

---

## Reddit — r/LocalLLaMA

**Title**

AnyLM – open-source desktop workspace on top of Ollama (projects, RAG, local OpenAI API)

**Body**

Built a local-first desktop app for people already on Ollama:

- Projects with instructions + RAG (chunk → embed with nomic-embed-text → retrieve)  
- Streaming chat, multi-agent runs, artifacts explorer  
- OpenAI-compatible local endpoint so other tools can share one runtime  
- macOS / Windows / Linux installers  

Site: https://anylm.app  
GitHub: https://github.com/workvar/AnyLM  

Looking for feedback from folks who bounce between chat UIs and editor integrations. What’s the first thing you’d want next — better model manager UX, MLX path, or stronger tool/skills story?

---

## Reddit — r/MachineLearning or r/selfhosted (shorter)

Open-source local LLM desktop app: projects + RAG on Ollama, plus a shared OpenAI-compatible endpoint for other apps. MIT. https://anylm.app · https://github.com/workvar/AnyLM

---

## X / Twitter

**Thread**

1/ Shipping AnyLM — a local-first desktop workspace for Ollama.

Projects + RAG. Multi-agent chat. One OpenAI-compatible endpoint for Cursor, Continue, and your scripts.

Nothing leaves your machine for inference.

https://anylm.app

2/ If you already pull models with Ollama, AnyLM is the projects layer: attach docs, retrieve chunks, keep history on disk, and stop pasting the same context into every tool.

3/ Installers for Mac, Windows, Linux. Open source (MIT).

Download → https://anylm.app/download  
Code → https://github.com/workvar/AnyLM

We’re on Product Hunt today too — link in reply / bio.

**Single tweet**

AnyLM: local LLM workspace for Ollama — projects, RAG, multi-agent chat, and one OpenAI-compatible endpoint every app can share. Free · MIT · Mac/Win/Linux → https://anylm.app

---

## LinkedIn

I just open-sourced AnyLM — a desktop workspace for local LLMs.

Teams keep asking for “Claude Projects, but on our machines.” AnyLM is that wedge: project instructions, document RAG, streaming multi-agent chat on Ollama, and a local OpenAI-compatible API so editors and scripts share one runtime.

Privacy-sensitive work stays local. Installers for macOS, Windows, and Linux.

Try it: https://anylm.app  
Source: https://github.com/workvar/AnyLM

Feedback from builders welcome — especially if you care about on-device governance next.

---

## Discord / Slack one-liner

AnyLM (MIT): local Ollama workspace with projects/RAG + a shared OpenAI-compatible endpoint — https://anylm.app · https://github.com/workvar/AnyLM
