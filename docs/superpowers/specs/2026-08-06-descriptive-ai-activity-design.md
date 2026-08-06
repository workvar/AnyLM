# Descriptive AI activity UI

**Date:** 2026-08-06  
**Status:** Approved  
**Approach:** Dedicated `chat:activity` channel from main (approach 3)  
**Surfaces:** `app/src/main/ipc.ts` (emit), `app/preload.ts` + `app/src/types/`, `app/src/renderer/js/` (trail, rail, sticky strip), `app/src/renderer/styles.css`

## Problem

While the model works, LLMeter mostly looks idle: typing dots in the bubble, tool runs only in the right-rail Progress panel, and sidebar working/waiting dots. Users cannot see thinking time, what is executing, or pending approvals without opening the rail. The experience feels opaque compared to Cursor-style agent transcripts.

## Decisions (locked)

| Topic | Choice |
|-------|--------|
| Where activity lives | **C** — Inline transcript trail + upgraded rail Progress |
| Event richness | **C** — Full Cursor-like log (thinking time, status lines, tool rows, inline Allow/Stop) |
| After turn completes | **A** — Collapse under the answer; expandable anytime |
| Sticky Working strip | **A** — Yes, above composer while the open chat is busy |
| Architecture | **3** — Main emits typed `chat:activity`; renderer paints only |

## Goals

1. Show what the model is doing in real time so waiting is informative, not boring.
2. One source of truth for labels/status: main process activity events.
3. Mirror the same events in the right-rail Progress panel.
4. Persist a compact activity trail on assistant messages so history is not empty after reload.
5. Surface pending tool confirms inline + in the sticky strip (Allow / Stop).

## Non-goals

- True model chain-of-thought / reasoning token streaming (timer + status only).
- Global multi-chat “Working” strip for background conversations (sidebar dots remain).
- Redesigning the ask-card beyond emitting matching status lines.
- Subagent / multi-agent UI (LLMeter has no subagents).
- Changing document-permission file-card flow (already inline).

---

## 1. Activity channel (architecture)

Main owns a typed event stream on IPC channel `chat:activity`. Every event includes `id` (chat request id) so the renderer routes to the correct in-flight turn.

### Event kinds

Discriminated union `ActivityEvent`:

| kind | When emitted | Fields |
|------|----------------|--------|
| `thinking` | Stream starts; resumes after a tool round | `phase: "start" \| "end"`, `ms?` on end |
| `status` | Phase transitions | `text` (human-readable) |
| `tool` | Tool start / finish | `name`, `args?`, `status: "running" \| "done"`, `output?`, `label` |
| `confirm` | Risky tool needs approval | `token`, `tool`, `args`, `label` |
| `ask` | Model asked the user (optional mirror; ask-card stays primary UX) | `token`, `question`, `options?` |
| `done` | Turn ends (success, stop, or error) | `thoughtMs`, `toolCount`, `summary` |

### IPC surface

- New: `window.api.onActivity(cb: (e: ActivityEvent & { id: string }) => void): Unsubscribe`
- Preload listens on `chat:activity`
- Types live in `api.d.ts` / `domain.d.ts`

### Labels

Main emits human `label` / `status` text. Renderer does not invent tool labels. Move `rail/labels.ts` helpers into main (e.g. `src/main/activity-labels.ts`) and include `label` on every `tool` / `confirm` event so rail and inline stay identical.

### Migration of `chat:tool`

Single change that:

1. Emits `chat:activity` for all phases.
2. Switches rail + chat consumers to `onActivity`.
3. Removes `chat:tool` / `onToolEvent` once call sites migrate (no compatibility shim).

Confirm handshake stays on `chat:tool-confirm` + `replyToolConfirm(token, approved)`. The prompt UI comes only from activity `confirm` events (inline + sticky strip). Do not keep a separate modal once inline Allow/Deny works.

---

## 2. UI layout

Three surfaces share the same events.

### 2.1 Inline activity trail

Sits above the assistant answer bubble for the live turn:

- Thinking row: “Thought briefly” → “Thought for Ns” while waiting for tokens / between rounds.
- Muted status lines between phases.
- Tool rows: bullet + label + short detail; expandable for args/output (Cursor “Ran 1 command” hierarchy).
- Pending confirm: accent row with **Allow** / **Deny** (replies via `replyToolConfirm`). **Stop** on the sticky strip cancels the whole turn, not a single tool.
- Final answer tokens continue to stream into the answer bubble below the trail.

On complete, trail **collapses** to one summary control, e.g. `Thought for 8s · 3 tools`. Click expands the full log (read-only if from history).

Visual tone: muted text, sparse bullets, no card chrome — match existing chat density.

### 2.2 Right-rail Progress

Fed by `onActivity` (`tool` / relevant `status`). Same compact step list as today (`startStep` / `finishStep`), labels from event payload.

### 2.3 Sticky “Working” strip

Floats above the composer while the **open** conversation has an in-flight turn:

- Title: “1 Working” (or current status text).
- Current activity label.
- **Stop** → `cancelChat` (aborts the turn).
- When a `confirm` is pending: **Allow** / **Deny** for that token (same as inline).
- Hidden when idle.
- Background chats: no strip; sidebar activity dots unchanged.

---

## 3. Persistence & turn lifecycle

### Live turn

`turns.ts` keeps `activity: ActivityEvent[]` on the in-flight turn. Events for that request `id` append or update in place (`thinking` end, tool `done`). On chat switch, detach like today’s bubble; on return, rebuild trail DOM from the array.

### Commit

Assistant `ChatMessage` gains optional:

```ts
activity?: {
  thoughtMs: number;
  toolCount: number;
  summary: string;        // "Thought for 8s · 3 tools"
  events: ActivityEvent[];
}
```

Messages without `activity` render as today.

### History

When painting stored messages, if `activity` exists, show the collapsed summary; expand rebuilds the trail read-only (no Allow).

### Ask / confirm

- Confirm: activity `confirm` + sticky Allow; reply via existing `replyToolConfirm`.
- Ask: existing ask-card; also emit `status` (“Waiting for your answer…”) for trail + strip.

### Cancel / error

Emit `done` (or clear via `done` with partial stats). Collapse trail; hide sticky strip.

---

## 4. Main-process emit points

In the chat loop (`ipc.ts` / ollama stream):

1. Before `chatStream` → `thinking` start + optional `status` (“Generating…” / “Thinking…”).
2. First token or stream end without tools → `thinking` end with `ms`.
3. Each tool call → `tool` running with `label`; on finish → `tool` done + truncated `output`.
4. Before confirm wait → `confirm` (+ keep reply channel).
5. Before ask wait → `status` waiting (+ existing `chat:ask`).
6. After tools, before next stream → `thinking` start again / `status` (“Continuing…”).
7. Finally → `done` with aggregated `thoughtMs`, `toolCount`, `summary`.

Thinking time is wall-clock on the main side (sum of intervals where the model was streaming or waiting for first token), not model reasoning tokens.

---

## 5. Testing

**Unit**

- Activity list reducer: append, update thinking end, tool done, build collapse summary, ignore wrong `id`.

**Manual**

- Tools off: thinking row + answer only.
- Tools on: multi-round tools with expandable output.
- Risky confirm: Allow / Deny from inline and from sticky strip.
- `ask_user`: status line + existing ask card.
- Switch chats mid-turn; return and see live trail.
- Reload chat: collapsed summary expands to stored events.
- Stop from sticky strip.

---

## 6. Implementation sketch (files)

| Area | Files |
|------|--------|
| Types | `api.d.ts`, `domain.d.ts` |
| Emit | `main/ipc.ts`, shared label helper |
| Bridge | `preload.ts` |
| Turn state | `renderer/js/turns.ts` |
| Trail UI | new `renderer/js/activity-trail.ts` (or similar) |
| Sticky strip | new module + `index.html` / CSS |
| Rail | `rail/index.ts`, `rail/progress.ts` |
| Message paint | `views.ts`, `messages.ts` |
| Styles | `styles.css` |

---

## Success criteria

- User can follow every tool and wait phase without opening the rail.
- Rail and inline trail never disagree on labels for the same tool.
- Completed turns show a one-line expandable summary; history restores it after restart.
- Sticky strip appears only for the open busy chat and supports Stop + pending Allow.
