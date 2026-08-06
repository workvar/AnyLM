# Reasoning stream + global Working strip

**Date:** 2026-08-06  
**Status:** Approved  
**Approach:** Extend existing `chat:activity` + `#working-strip` (approach 1)  
**Builds on:** `2026-08-06-descriptive-ai-activity-design.md` (these were non-goals there)

## Problem

1. Wall-clock “thinking” treats every wait before the first answer token the same. Models that stream real reasoning (`message.thinking` via Ollama `think`) should drive the activity phase from those tokens — without exposing chain-of-thought text.
2. The sticky Working strip only covers the **open** busy chat. Background conversations only show sidebar dots, so users miss multi-chat work when viewing an idle chat.

## Decisions (locked)

| Topic | Choice |
|-------|--------|
| Architecture | Extend `chat:activity` + existing strip; no new IPC channel |
| Non-thinking models | Keep today’s wall-clock thinking unchanged |
| Thinking models | Detect `message.thinking`; status “Reasoning…” + timer; **never** show CoT text |
| Open busy + background busy | Open-chat strip only (“1 Working” + Stop/Allow); ignore background count |
| Open idle + background busy | Compact strip: count + titles; no Stop/Allow/Deny |
| Sidebar | Dots remain unchanged |

## Goals

1. True reasoning-token–driven phase for capable models (timer + status only).
2. Compact global awareness of background chats when the open turn is idle.
3. Preserve current open-chat strip, trail, rail, and persistence behavior.

## Non-goals

- Displaying, streaming, or persisting chain-of-thought / reasoning text.
- Stop / Allow / Deny for background conversations from the strip.
- Redesigning ask-card or document-permission file-card flows.
- Subagent / multi-agent UI.

---

## 1. Architecture

### 1.1 Reasoning tokens (main)

1. `ollama.chatStream` gains optional `think?: boolean` and a richer token callback:

   ```ts
   onPiece: (piece: { content?: string; thinking?: string }) => void
   ```

2. Stream handler reads `obj.message?.thinking` and `obj.message?.content`. Thinking text is **discarded** after detection (not accumulated for UI, not sent on `chat:chunk`).

3. Chat loop (`ipc.ts`) still emits wall-clock `thinking` start before each stream round.

4. On **first** non-empty thinking chunk for that round:
   - Emit `status` with text `"Reasoning…"` once.
   - Leave the open thinking span / timer running.

5. On **first** content chunk:
   - End thinking (`phase: "end"`, `ms`).
   - Emit `status` `"Writing reply…"`.
   - Forward content on `chat:chunk` as today.

6. If no thinking chunks arrive: behavior identical to today (end thinking on first content or stream end).

7. **When to pass `think: true`:** name/family heuristic (aligned with existing catalog signals such as reason / r1 / think / qwen3 / deepseek). Ordinary models omit `think`.

8. If Ollama rejects a request with `think`, **retry once** for that round without `think` and continue on the wall-clock path.

### 1.2 Global strip (renderer)

Source of truth:

- Open in-flight turn: `turns.ts` (existing).
- Background chats: `activity.ts` maps (`status` + `titles`), already updated via `setActivity` / `clearActivity`.

`syncWorkingStrip()` rules:

| Condition | Strip mode |
|-----------|------------|
| Open turn in-flight | **Open** — label + Stop; Allow/Deny when needed. Title stays “1 Working”. Ignore other activity keys. |
| Open turn idle/absent, activity map non-empty | **Compact** — title `N Working` / `N Waiting` / `N active` (mixed); label = joined titles; hide Stop/Allow/Deny. |
| Otherwise | Hidden |

Export a small read API from `activity.ts` (e.g. `listActivity()`) so the strip can count statuses and join titles without duplicating maps.

Sidebar `paintActivity` unchanged.

---

## 2. UI

### 2.1 Inline trail

- Thinking row still uses `formatThought(ms)`.
- Reasoning phase adds a muted `"Reasoning…"` status line via existing status events.
- No expandable CoT block; no thinking text in the DOM.
- Collapse summary unchanged: `Thought for Ns · N tools` (wall-clock total, including reasoning span).

### 2.2 Open-chat Working strip

Unchanged controls. While reasoning, `stripLabel` may surface `"Reasoning…"` (status wins over live thought tick when present).

### 2.3 Compact global strip

- Same `#working-strip` mount; add class `is-compact`.
- Title:
  - only `working` → `N Working`
  - only `waiting` → `N Waiting`
  - mixed → `N active`
- Label: comma-joined conversation titles from the activity map (ellipsis). Titles come from existing `setActivity(key, value, turn.label)` (convo name).
- Hide `#working-allow`, `#working-deny`, `#working-stop`.
- Display-only: no strip click-to-switch; user uses the sidebar.
- Visual: reuse strip styles; quieter without the action cluster (optional muted title). No new chrome.

---

## 3. Edge cases

- Thinking chunks then tools / empty content: end thinking on stream end; emit “Writing reply…” only if content arrives.
- Chat switch mid-turn: open strip follows `activeKey()`; background keys remain in the activity map for compact mode.
- Open turn completes while others still run: switch to compact without requiring a navigation.
- Single background chat: `1 Working` + that title.
- Waiting-only background: compact `N Waiting`; no Allow on strip (open that chat).
- Persistence: no new `ChatMessage` fields; `"Reasoning…"` may appear in stored `events` like any other status.

---

## 4. Files (expected)

| Area | Files |
|------|--------|
| Stream | `app/src/main/ollama.ts` |
| Think heuristic | helper near `model-catalog` or `ollama` |
| Emit | `app/src/main/ipc.ts` |
| Activity list | `app/src/renderer/js/activity.ts` |
| Strip | `working-strip.ts`, `turns.ts` (`syncWorkingStrip`), CSS / `index.html` as needed |
| Tests | think heuristic; activity list helper; strip sync if extracted as pure fn |

---

## 5. Testing

**Unit**

- Think-capable name heuristic true/false cases.
- `listActivity` (or equivalent) returns counts + titles.
- Pure strip-mode selector: open busy → open; idle + map → compact; empty → null.
- Stream piece parsing: thinking-only vs content-only vs both (if extracted).

**Manual**

- Non-thinking model: same as today.
- Thinking-capable model: Reasoning… + timer, then Writing reply…; no CoT in UI.
- Background chat working while viewing idle chat: compact strip; sidebar dots pulse.
- Switch into busy chat: full strip + Stop.
- Finish open turn with others busy: compact appears.
- `think` rejected by Ollama: retry without `think`; wall-clock path.

---

## Success criteria

- Thinking models show a reasoning phase driven by real `message.thinking` chunks (timer + status only; no CoT text).
- Non-thinking models behave as before.
- Viewing an idle chat while others work shows a compact count + titles strip without action buttons.
- Open busy chat strip and sidebar dots behave as today.
- No new IPC channel; activity trail/rail stay consistent.
`}