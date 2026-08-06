# Reasoning Stream + Global Working Strip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Drive thinking-phase activity from real Ollama `message.thinking` tokens (timer + status only), and show a compact multi-chat Working strip when the open turn is idle.

**Architecture:** Extend `ollama.chatStream` to optionally pass `think` and emit `{ content?, thinking? }` pieces. `ipc.ts` emits existing `chat:activity` status/thinking events. Renderer adds `listActivity()` and a pure strip-mode selector; `paintWorkingStrip` gains compact mode.

**Tech Stack:** Electron main/renderer TypeScript, Bun tests (`bun:test`), existing `chat:activity` IPC.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-06-reasoning-stream-global-strip-design.md`
- Never show/persist/stream CoT text — detect thinking chunks only.
- Non-thinking models: wall-clock behavior unchanged.
- Open busy turn: open strip only (ignore background count).
- Compact strip: count + titles; no Stop/Allow/Deny.
- Sidebar dots unchanged.
- No new IPC channel.
- Commit only when the user explicitly asks (skip plan commit steps otherwise).

## File map

| File | Responsibility |
|------|----------------|
| `src/main/think.ts` | `modelSupportsThink(name: string): boolean` |
| `src/main/ollama.ts` | `think` request flag; stream `thinking` + `content` pieces |
| `src/main/ipc.ts` | Reasoning… status; think retry; richer onPiece |
| `src/main/proxy/handlers.ts` | Adapt to piece object (`piece.content`) |
| `src/renderer/js/activity.ts` | `listActivity()` |
| `src/renderer/js/working-strip-mode.ts` | Pure strip state selector |
| `src/renderer/js/working-strip.ts` | Paint open vs compact |
| `src/renderer/js/turns.ts` | `syncWorkingStrip` uses selector; refresh on activity clear |
| `src/renderer/index.html` | `id` on strip title |
| `src/renderer/styles.css` | `.working-strip.is-compact` |
| `*.test.ts` | Heuristic, listActivity, strip mode |

---

### Task 1: Think heuristic + stream pieces

**Files:**
- Create: `app/src/main/think.ts`
- Create: `app/src/main/think.test.ts`
- Modify: `app/src/main/ollama.ts`
- Modify: `app/src/main/proxy/handlers.ts`
- Create: `app/src/main/ollama-stream.test.ts` (pure parse helper if extracted)

**Interfaces:**
- Produces:
  - `modelSupportsThink(model: string): boolean`
  - `chatStream(..., onPiece: (p: { content?: string; thinking?: string }) => void, tools?, numCtx?, signal?, think?: boolean)`
  - Thinking text discarded by callers (not accumulated for UI)

- [ ] **Step 1: Failing tests for heuristic**

```typescript
// app/src/main/think.test.ts
import { describe, expect, test } from "bun:test";
import { modelSupportsThink } from "./think";

describe("modelSupportsThink", () => {
  test("true for reasoning families", () => {
    expect(modelSupportsThink("deepseek-r1:latest")).toBe(true);
    expect(modelSupportsThink("qwen3:8b")).toBe(true);
    expect(modelSupportsThink("magistral")).toBe(true);
  });
  test("false for ordinary chat", () => {
    expect(modelSupportsThink("llama3.2:latest")).toBe(false);
    expect(modelSupportsThink("mistral:7b")).toBe(false);
  });
});
```

- [ ] **Step 2: Implement `think.ts`**

Match `/r1|reason|think|qwen3|deepseek|magistral|gpt-oss|openthinker/i` on model name (case-insensitive).

- [ ] **Step 3: Update `chatStream`**

Add optional `think?: boolean`. Body includes `think: true` when set. Callback receives `{ content?, thinking? }` when either field is non-empty. Accumulate only `content` into `full` / return text.

- [ ] **Step 4: Update proxy handlers** to `(piece) => chunk({ content: piece.content || "" }, null)` and ignore empty.

- [ ] **Step 5: Run** `bun test src/main/think.test.ts`

---

### Task 2: IPC reasoning status + think retry

**Files:**
- Modify: `app/src/main/ipc.ts` (chat loop around `chatStream` / `onPiece`)

**Interfaces:**
- Consumes: `modelSupportsThink`, richer `chatStream`
- Produces: `status: "Reasoning…"` once per round on first thinking chunk; existing thinking end + `"Writing reply…"` on first content

- [ ] **Step 1: Wire onPiece**

```typescript
let wroteStatus = false;
let sawReasoning = false;
const useThink = modelSupportsThink(useModel);
const onPiece = (piece: { content?: string; thinking?: string }) => {
  if (piece.thinking && !sawReasoning) {
    sawReasoning = true;
    act({ kind: "status", text: "Reasoning…" });
  }
  if (piece.content) {
    if (!wroteStatus) {
      wroteStatus = true;
      endThinking();
      act({ kind: "status", text: "Writing reply…" });
    }
    send("chat:chunk", { id, text: piece.content });
  }
};
```

- [ ] **Step 2: Call with think + one retry**

```typescript
try {
  result = await ollama.chatStream(useModel, full, onPiece, toolDefs, null, undefined, useThink || undefined);
} catch (e) {
  if (!useThink) throw e;
  // Reset per-round flags that may have partially fired? Prefer retry only if no content/reasoning yet.
  result = await ollama.chatStream(useModel, full, onPiece, toolDefs);
}
```

If first attempt fails before any pieces, reset `wroteStatus`/`sawReasoning` before retry. Pass `numCtx` if the existing call site uses it (match current arity).

- [ ] **Step 3: Typecheck / smoke** `bun run typecheck` in `app/`

---

### Task 3: listActivity + strip mode selector

**Files:**
- Modify: `app/src/renderer/js/activity.ts`
- Create: `app/src/renderer/js/activity-list.test.ts` (or extend)
- Create: `app/src/renderer/js/working-strip-mode.ts`
- Create: `app/src/renderer/js/working-strip-mode.test.ts`

**Interfaces:**
- Produces:
  - `listActivity(): { key: string; status: "working" | "waiting"; title: string }[]`
  - `resolveWorkingStrip(input): null | OpenStrip | CompactStrip`

```typescript
type OpenStrip = { mode: "open"; label: string; confirmToken?: string };
type CompactStrip = { mode: "compact"; title: string; label: string };

function resolveWorkingStrip(input: {
  openBusy: boolean;
  openLabel?: string;
  openConfirmToken?: string;
  others: { status: "working" | "waiting"; title: string }[];
}): null | OpenStrip | CompactStrip
```

Compact title: only working → `N Working`; only waiting → `N Waiting`; mixed → `N active`. Label: titles joined with `", "`.

- [ ] **Step 1: Failing tests** for `listActivity` + `resolveWorkingStrip` (open busy ignores others; idle+others → compact; empty → null).

- [ ] **Step 2: Implement** until tests pass.

---

### Task 4: Wire compact strip UI

**Files:**
- Modify: `app/src/renderer/js/working-strip.ts`
- Modify: `app/src/renderer/js/turns.ts` (`syncWorkingStrip`, call after clearActivity paths)
- Modify: `app/src/renderer/index.html` — add `id="working-strip-title"`
- Modify: `app/src/renderer/styles.css` — `.working-strip.is-compact .working-strip-actions { display: none }` and muted title optional

**Interfaces:**
- `paintWorkingStrip(state: null | { mode: "open"; label: string; confirmToken?: string } | { mode: "compact"; title: string; label: string }): void`

- [ ] **Step 1: Update paintWorkingStrip** for compact (set title text, `is-compact`, hide actions including Stop).

- [ ] **Step 2: `syncWorkingStrip`** uses `resolveWorkingStrip` + `listActivity` filtered to exclude `activeKey()` when building `others` for compact (open busy path does not need others). When open busy, pass `openBusy: true`. When open idle, pass all activity entries as others (including waiting).

- [ ] **Step 3: Ensure** `clearActivity` / turn complete / chat switch still calls `syncWorkingStrip` so compact appears when open finishes and backgrounds remain.

- [ ] **Step 4: Run** `bun test` for new tests + `bun run typecheck`

---

## Spec coverage

| Spec requirement | Task |
|------------------|------|
| `think` + thinking pieces, no CoT UI | 1–2 |
| Reasoning… then Writing reply… | 2 |
| Heuristic + retry without think | 1–2 |
| Compact strip count/titles, no actions | 3–4 |
| Open busy ignores background | 3–4 |
| Sidebar dots unchanged | 4 (no change to paintActivity) |

## Self-review

- No TBD/placeholders.
- Callback type consistent across ollama / ipc / proxy.
- Strip mode types match paintWorkingStrip.
`}