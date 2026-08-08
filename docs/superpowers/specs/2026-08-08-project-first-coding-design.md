# Project-first coding

**Date:** 2026-08-08  
**Status:** Approved (design)  
**Approach:** Structured project-coding path (approach 2)  
**Surfaces:** `app/src/main/` (intent gate, pipeline, workspace auto-create, summary), existing tools/activity IPC, chat transcript summary UX

## Problem

When users ask local models (e.g. Qwen coder) to write code into a project, AnyLM often streams a large source dump into the chat bubble instead of creating files. Users want:

1. A real project directory on disk
2. Current docs researched online when possible (offline → model knowledge)
3. Official CLI scaffolds via the terminal when available, then file tools for app code
4. Status-only feedback while working (“setting up project”, “looking up docs”, “using terminal”, “generating code”)
5. After completion: a brief summary of files/commands — **no full source pasted in chat**

Existing building blocks already cover much of the mechanics (`write_file`, `run_shell`, `web_search`, workspace sandbox, `chat:activity`), but nothing routes coding turns through a project-first pipeline or suppresses code dumps in the final reply.

## Decisions (locked)

| Topic | Choice |
|-------|--------|
| Scope this phase | Project-first coding only (RAM kill / multi-agent load protection deferred) |
| Chat UX | Status while working; then file/command summary — no full source |
| Activation | Automatic when the request looks like coding/scaffolding **and** tools are available |
| No working folder | Auto-create under `~/AnyLM-Projects/<slug>/`, set as workspace, continue |
| Scaffolding | Prefer official CLIs (`npm create`, `cargo new`, etc.) via `run_shell`, then `write_file` |
| Docs | Always attempt online lookup; soft-fail offline and use known knowledge |
| Architecture | Structured project-coding path beside the existing chat/tool loop |

## Goals

1. Coding/scaffolding turns create or update files in a working folder instead of pasting full programs in chat.
2. Prefer official project CLIs when they exist; fill in with file tools.
3. Always try current docs via `web_search`; degrade gracefully offline.
4. Show informative activity status during work; final assistant message is a short summary.
5. Reuse existing tools, confirms, workspace sandbox, and activity channel.

## Non-goals

- RAM / memory kill threshold setting (deferred with load-protection phase).
- Full Phase 3 Coder multi-agent catalog.
- Always-on project mode for every message (Q&A and small snippets stay on the normal path when intent is not coding).
- Expanding tool confirm UX beyond existing Allow/Deny.
- Changing multi-agent Phase 1 orchestration beyond optional coexistence (project-coding path is independent).

---

## 1. Architecture

Keep the normal chat loop (single-agent tool loop and existing multi-agent path) for non-coding turns. On each `chat:send`:

1. **Coding intent gate** — fast heuristics. Clear coding → project-coding path. Clear non-coding → existing path. Ambiguous → existing path (do not force).
2. **Tools availability gate** — if tools are disabled for the chat, do not enter project-coding; use the normal reply path.
3. **Project-coding pipeline** (main process):
   - Ensure workspace (auto-create if needed)
   - Docs step (`web_search`; soft-fail offline)
   - Tool loop with a strict project-first system prompt (CLI scaffold → file writes)
   - Finalize: summary-only assistant message; strip large fenced code from the final text if the model still dumps source
4. **UI** — reuse `chat:activity` for status/tool events. Do not stream full source into the bubble as the primary deliverable.

```
chat:send
  → coding intent && tools available?
      no  → existing single/multi-agent path
      yes → status "Setting up project"
          → ensure workspace (auto-create if needed)
          → status "Looking up docs" → web_search (or soft-skip)
          → tool loop (run_shell scaffolds + write_file)
          → activity status only while tools run
          → final message = summary only
```

---

## 2. Components & contracts

| Unit | Responsibility | Depends on |
|------|----------------|------------|
| `coding-intent.ts` | Heuristics: is this turn project-coding? | user text |
| `project-coding.ts` | Pipeline orchestration + project-first prompt | workspace, tools, activity, summary |
| `workspace.ts` (extend) | Auto-create `~/AnyLM-Projects/<slug>/`, set root | fs, settings/store |
| `summary.ts` | Build file/command summary; strip large code fences from final text | tool results |
| Existing `tools/*`, activity labels | Unchanged executors; richer status strings for this path | — |

### Intent heuristics (v1)

Positive signals (any strong match → coding path): create/scaffold/init project or app; “write/add/implement” + file/component/module; language/framework + “app”/“project”; “in the project” / “working folder” + code task.

Negative / stay normal: explain/how does X work; pure Q&A; “show me an example snippet” without asking to create files; short conceptual questions.

Ambiguous → normal path.

### Workspace auto-create

- Default base: `~/AnyLM-Projects/` (create if missing).
- Slug from user prompt or chat title: lowercase, alphanumeric + hyphens, max 48 characters; on collision append a short numeric/random suffix.
- Call existing workspace `set(root)` so file tools sandboxed to that folder.
- Emit activity status with the created path.
- Notify renderer so the workspace chip updates (reuse existing workspace IPC/events if present; add a small event if needed).

### Project-first prompt (project-coding path only)

Instruct the model to:

1. Use `web_search` for current official starter/docs when online context is needed (pipeline may also run an explicit docs step).
2. Prefer `run_shell` for official CLIs when creating a new project.
3. Use `write_file` / `create_directory` for application code and edits.
4. **Never** paste full source files into the chat reply.
5. After tools finish, reply with a short summary: commands run + paths created/updated + how to run.

### Summary contract

Final assistant `text` must be short prose plus lists, e.g.:

- Project path
- Commands run (or “CLI skipped — user denied” / “CLI failed — used file tools”)
- Files created/updated
- Docs note if offline (“docs lookup skipped (offline)”)
- Next step (e.g. `npm run dev`)

Post-process: if the model still emits fenced code blocks longer than **20 lines** (or **500 characters**) in the final message, strip those fences and keep/replace with a one-line pointer to the file list. Short illustrative fences under that threshold may remain.

### Activity status strings

Emit human status lines such as:

- Setting up project
- Looking up docs
- Using terminal
- Generating code
- Writing summary

Tool events continue to use existing labels (`run_shell` → “Running a command”, `write_file` → “Writing a file”, etc.).

---

## 3. Data flow

1. Renderer `chat:send` → main (unchanged entry).
2. Main runs coding-intent + tools-available checks.
3. On project-coding:
   - `act({ kind: "status", text: "Setting up project" })`
   - Ensure workspace; optional renderer notify
   - Docs: `web_search` or soft-skip
   - Run tool loop with project-first system prompt (same confirm/ask/security as today)
   - Collect tool outcomes → `summary.ts`
   - Stream/set final assistant message = summary; fence-strip if needed
   - `act({ kind: "done", ... })`
4. On non-coding: existing path unchanged.

Streaming policy for project-coding: prefer showing activity trail + sticky Working strip; avoid treating large mid-turn code streams as the user-visible answer. Implementation may buffer or suppress assistant token stream until tools complete, then emit summary only — exact buffering detail left to the plan, as long as the user-facing result matches the UX decision.

---

## 4. Error handling

| Case | Behavior |
|------|----------|
| No folder selected | Auto-create under `~/AnyLM-Projects/<slug>/`, set workspace, continue |
| Docs search fails / offline | Soft-fail; continue with model knowledge; note in summary |
| User denies `run_shell` | Skip CLI; fall back to `create_directory` + `write_file`; note in summary |
| CLI scaffold fails | Retry once with file-tools-only path; if still failing, short error + what was created |
| User hits Stop | Cancel like today; include partial file/command summary if any work landed |
| Ambiguous / non-coding | Normal chat path |
| Tools disabled | Normal chat path (do not enter project-coding) |
| Model dumps code in final text | Strip large fences; keep summary |

---

## 5. Testing

- Unit: coding-intent heuristics (positive / negative / ambiguous)
- Unit: workspace auto-create + slug sanitization + collision suffix
- Unit: summary builder from mock tool results; fence-stripping
- Unit/integration: soft-fails (offline docs, denied shell) still produce a usable summary
- Manual: “create a React student list app” with tools on → status trail, files on disk under workspace / auto-created project, no full source in chat

---

## 6. Out of scope follow-ups

- RAM % kill setting and multi-agent load shedding (user deferred; pair with a later load-protection spec)
- Dedicated Phase 3 Coder agent role in the multi-agent graph
- Expandable code preview after summary (explicitly not chosen for v1 UX)

## Success criteria

1. Coding request with tools on creates files under a working folder (auto-created if needed).
2. Prefer CLI scaffold when an official starter exists and shell is approved.
3. Online: docs search attempted; offline: continues without blocking.
4. While working, user sees status/tool activity — not a wall of source as the primary UI.
5. Final assistant message is a file/command summary without full pasted programs.
