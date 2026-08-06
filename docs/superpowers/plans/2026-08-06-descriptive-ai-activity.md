# Descriptive AI Activity UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stream a typed `chat:activity` channel from main so the chat shows a Cursor-style thinking/tool/status trail, the rail Progress panel mirrors the same events, and a sticky Working strip offers Stop plus inline Allow/Deny.

**Architecture:** Main emits `ActivityEvent`s on `chat:activity` (with request `id`) at each chat-loop phase. A pure reducer owns the event list and collapse summary. The renderer paints an inline trail above the answer bubble, feeds the rail from the same subscription, and shows a sticky strip for the open busy chat. Completed turns persist `message.activity` on the assistant `ChatMessage` for history restore.

**Tech Stack:** Electron IPC, TypeScript, vanilla DOM (`el`/`node`), Bun tests (`bun:test`), CSS in `styles.css`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-06-descriptive-ai-activity-design.md`
- Approach 3: main emits labels; renderer does not invent tool names.
- Surfaces: inline trail + rail Progress + sticky Working strip for the **open** chat only.
- After turn: collapse to expandable summary; persist on assistant message.
- Confirm UI: inline + sticky **Allow/Deny**; sticky **Stop** cancels the whole turn via `cancelChat`.
- Remove `chat:tool` / `onToolEvent` once consumers migrate; keep `chat:tool-confirm` + `replyToolConfirm` handshake.
- Thinking time is wall-clock (main intervals); live “Thought for Ns” may tick in the renderer after `thinking` start.
- No true model chain-of-thought; no global multi-chat Working strip; do not redesign ask-card beyond status mirroring.
- Commit steps run only when the user explicitly asks to commit (user rule); otherwise skip commits and leave changes unstaged.

## File map

| File | Responsibility |
|------|----------------|
| `src/types/domain.d.ts` | `ActivityEvent`, `MessageActivity` on `ChatMessage` |
| `src/types/api.d.ts` | `onActivity`; remove `onToolEvent` / `ToolEvent` |
| `src/main/activity-labels.ts` | `labelFor` / `detailFor` (moved from renderer) |
| `src/main/activity.ts` | `emitActivity(send, id, event)` helper + thought timer helpers |
| `src/main/ipc.ts` | Emit activity around chat loop; stop `chat:tool`; confirm + ask status |
| `preload.ts` | `onActivity` → `chat:activity` |
| `src/renderer/js/activity-store.ts` | Pure reducer + summary builders (unit-tested) |
| `src/renderer/js/activity-trail.ts` | Inline trail DOM (live + collapsed history) |
| `src/renderer/js/working-strip.ts` | Sticky Working strip above composer |
| `src/renderer/js/turns.ts` | Subscribe, attach trail, persist `activity`, reattach |
| `src/renderer/js/rail/index.ts` | Feed Progress from `onActivity` |
| `src/renderer/js/rail/labels.ts` | Delete after main owns labels (or thin re-export if needed briefly) |
| `src/renderer/js/chat.ts` | Remove modal confirm wiring; keep doc-permission card |
| `src/renderer/js/convo.ts` | Paint collapsed trail when rendering history |
| `src/renderer/index.html` | `#working-strip` mount |
| `src/renderer/styles.css` | Trail, strip, confirm row styles |

---

### Task 1: Types + pure activity store

**Files:**
- Modify: `src/types/domain.d.ts` (`ChatMessage` + new activity types)
- Modify: `src/types/api.d.ts` (`onActivity`; deprecate/remove `ToolEvent` / `onToolEvent`)
- Create: `src/renderer/js/activity-store.ts`
- Create: `src/renderer/js/activity-store.test.ts`

**Interfaces:**
- Produces:
  - `ActivityEvent` union (ambient in `domain.d.ts`)
  - `MessageActivity` `{ thoughtMs: number; toolCount: number; summary: string; events: ActivityEvent[] }`
  - `applyActivity(events: ActivityEvent[], ev: ActivityEvent): ActivityEvent[]`
  - `formatThought(ms: number): string` — `< 1500` → `"Thought briefly"`, else `` `Thought for ${Math.round(ms / 1000)}s` ``
  - `buildSummary(thoughtMs: number, toolCount: number): string` — e.g. `"Thought for 8s · 3 tools"` / `"Thought briefly"` when `toolCount === 0`
  - `toolCountOf(events: ActivityEvent[]): number` — count of `kind === "tool" && status === "done"` (or unique running→done pairs)

- [ ] **Step 1: Write failing tests**

```typescript
// src/renderer/js/activity-store.test.ts
import { describe, expect, test } from "bun:test";
import { applyActivity, formatThought, buildSummary, toolCountOf } from "./activity-store";

describe("formatThought", () => {
  test("brief under 1.5s", () => {
    expect(formatThought(800)).toBe("Thought briefly");
  });
  test("seconds when longer", () => {
    expect(formatThought(5200)).toBe("Thought for 5s");
  });
});

describe("applyActivity", () => {
  test("appends status", () => {
    const next = applyActivity([], { kind: "status", text: "Generating…" });
    expect(next).toEqual([{ kind: "status", text: "Generating…" }]);
  });

  test("thinking start then end updates same row", () => {
    let evs = applyActivity([], { kind: "thinking", phase: "start" });
    evs = applyActivity(evs, { kind: "thinking", phase: "end", ms: 3000 });
    expect(evs).toEqual([{ kind: "thinking", phase: "end", ms: 3000 }]);
  });

  test("tool running then done updates matching open tool", () => {
    let evs = applyActivity([], {
      kind: "tool",
      name: "web_search",
      status: "running",
      label: "Searching the web",
      args: { query: "x" },
    });
    evs = applyActivity(evs, {
      kind: "tool",
      name: "web_search",
      status: "done",
      label: "Searching the web",
      output: "ok",
    });
    expect(evs).toHaveLength(1);
    expect(evs[0]).toMatchObject({ status: "done", output: "ok" });
    expect(toolCountOf(evs)).toBe(1);
  });

  test("buildSummary", () => {
    expect(buildSummary(800, 0)).toBe("Thought briefly");
    expect(buildSummary(8000, 3)).toBe("Thought for 8s · 3 tools");
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `cd app && bun test src/renderer/js/activity-store.test.ts`  
Expected: FAIL (module / exports missing)

- [ ] **Step 3: Add types to `domain.d.ts`**

```typescript
type ActivityEvent =
  | { kind: "thinking"; phase: "start" | "end"; ms?: number }
  | { kind: "status"; text: string }
  | {
      kind: "tool";
      name: string;
      label: string;
      status: "running" | "done";
      args?: Record<string, unknown>;
      output?: string;
      detail?: string;
    }
  | {
      kind: "confirm";
      token: string;
      label: string;
      tool: { name: string; description: string };
      args: Record<string, unknown>;
    }
  | {
      kind: "ask";
      token: string;
      question: string;
      options?: string[];
    }
  | {
      kind: "done";
      thoughtMs: number;
      toolCount: number;
      summary: string;
    };

interface MessageActivity {
  thoughtMs: number;
  toolCount: number;
  summary: string;
  events: ActivityEvent[];
}

interface ChatMessage {
  role: ChatRole;
  content: string;
  images?: string[];
  tool_calls?: OllamaToolCall[];
  tool_name?: string;
  activity?: MessageActivity;
}
```

In `api.d.ts`, add:

```typescript
interface ActivityIpcEvent extends ActivityEvent {
  id: string;
}

// on AnyLmApi:
onActivity(cb: (e: ActivityIpcEvent) => void): Unsubscribe;
```

Remove `ToolEvent` and `onToolEvent` from `api.d.ts` in this task only if Task 5 will migrate rail in the same session before typecheck — otherwise keep them until Task 5 and delete then. Prefer: keep until Task 5 to avoid a broken typecheck mid-plan.

- [ ] **Step 4: Implement `activity-store.ts`**

```typescript
export function formatThought(ms: number): string {
  if (ms < 1500) return "Thought briefly";
  return `Thought for ${Math.round(ms / 1000)}s`;
}

export function buildSummary(thoughtMs: number, toolCount: number): string {
  const thought = formatThought(thoughtMs);
  if (!toolCount) return thought;
  return `${thought} · ${toolCount} tool${toolCount === 1 ? "" : "s"}`;
}

export function toolCountOf(events: ActivityEvent[]): number {
  return events.filter((e) => e.kind === "tool" && e.status === "done").length;
}

export function applyActivity(events: ActivityEvent[], ev: ActivityEvent): ActivityEvent[] {
  if (ev.kind === "thinking" && ev.phase === "end") {
    const next = events.slice();
    for (let i = next.length - 1; i >= 0; i--) {
      const cur = next[i];
      if (cur.kind === "thinking" && cur.phase === "start") {
        next[i] = ev;
        return next;
      }
    }
    return [...next, ev];
  }
  if (ev.kind === "tool" && ev.status === "done") {
    const next = events.slice();
    for (let i = next.length - 1; i >= 0; i--) {
      const cur = next[i];
      if (cur.kind === "tool" && cur.status === "running" && cur.name === ev.name) {
        next[i] = { ...cur, ...ev, status: "done" };
        return next;
      }
    }
    return [...next, ev];
  }
  if (ev.kind === "done") {
    // Keep prior events for the trail; done is metadata for consumers — do not append.
    return events;
  }
  return [...events, ev];
}
```

- [ ] **Step 5: Run tests — expect PASS**

Run: `cd app && bun test src/renderer/js/activity-store.test.ts`  
Expected: PASS

- [ ] **Step 6: Commit** (only if user asked)

```bash
git add src/types/domain.d.ts src/types/api.d.ts src/renderer/js/activity-store.ts src/renderer/js/activity-store.test.ts
git commit -m "feat: activity event types and pure store reducer"
```

---

### Task 2: Main labels + activity emit helper

**Files:**
- Create: `src/main/activity-labels.ts` (copy from `src/renderer/js/rail/labels.ts`)
- Create: `src/main/activity.ts`
- Create: `src/main/activity-labels.test.ts` (optional but preferred — mirror label/detail cases)

**Interfaces:**
- Consumes: none
- Produces:
  - `labelFor(name: string): string`
  - `detailFor(name: string, args: Record<string, unknown>): string`
  - `createThoughtTimer(): { start(): void; end(): number; totalMs(): number }`
  - `activitySend(send: (ch: string, payload: unknown) => void, id: string, event: ActivityEvent): void`

- [ ] **Step 1: Create `activity-labels.ts`**

Copy the `LABELS` map, `labelFor`, and `detailFor` from `src/renderer/js/rail/labels.ts` unchanged into `src/main/activity-labels.ts` (CommonJS-friendly `export { labelFor, detailFor }`).

- [ ] **Step 2: Create `activity.ts`**

```typescript
import type { /* ActivityEvent is ambient */ } from "../types/domain"; // do not import — ambient

function activitySend(
  send: (channel: string, payload: unknown) => void,
  id: string,
  event: ActivityEvent
): void {
  send("chat:activity", { id, ...event });
}

function createThoughtTimer() {
  let total = 0;
  let startedAt: number | null = null;
  return {
    start() {
      if (startedAt == null) startedAt = Date.now();
    },
    end() {
      if (startedAt == null) return 0;
      const ms = Date.now() - startedAt;
      total += ms;
      startedAt = null;
      return ms;
    },
    totalMs() {
      if (startedAt != null) return total + (Date.now() - startedAt);
      return total;
    },
  };
}

export { activitySend, createThoughtTimer };
```

- [ ] **Step 3: Typecheck main**

Run: `cd app && bun run typecheck`  
Expected: PASS (or only unrelated existing errors)

- [ ] **Step 4: Commit** (only if user asked)

```bash
git add src/main/activity-labels.ts src/main/activity.ts
git commit -m "feat: main activity labels and emit helper"
```

---

### Task 3: Emit `chat:activity` from the chat loop

**Files:**
- Modify: `src/main/ipc.ts` (chat:start handler / agent loop)
- Ensure ask path: if `toolsExec.execute` / skills path needs `context.ask`, wire it and emit status (renderer already has `onAsk`)

**Interfaces:**
- Consumes: `activitySend`, `createThoughtTimer`, `labelFor`, `detailFor`
- Produces: live `chat:activity` stream per request `id`; stops emitting `chat:tool`

- [ ] **Step 1: Import helpers at top of `ipc.ts`**

```typescript
import { labelFor, detailFor } from "./activity-labels";
import { activitySend, createThoughtTimer } from "./activity";
```

- [ ] **Step 2: Inside the chat handler, before the agent `for` loop**

```typescript
const thought = createThoughtTimer();
const act = (event: ActivityEvent) => activitySend(send, id, event);
let toolsRun = 0;
```

- [ ] **Step 3: Wrap each `ollama.chatStream` call**

Before stream:

```typescript
thought.start();
act({ kind: "thinking", phase: "start" });
act({ kind: "status", text: rounds === 0 ? "Generating…" : "Continuing…" });
```

On first token (wrap the chunk callback):

```typescript
let endedThinking = false;
const onPiece = (piece: string) => {
  if (!endedThinking) {
    endedThinking = true;
    const ms = thought.end();
    act({ kind: "thinking", phase: "end", ms });
  }
  send("chat:chunk", { id, text: piece });
};
```

If the stream ends with no tokens, still end thinking:

```typescript
if (!endedThinking) {
  const ms = thought.end();
  act({ kind: "thinking", phase: "end", ms });
}
```

- [ ] **Step 4: Replace `chat:tool` sends**

```typescript
const label = labelFor(fname);
const detail = detailFor(fname, fargs);
act({
  kind: "tool",
  name: fname,
  label,
  detail,
  args: fargs,
  status: "running",
});
// ... execute ...
toolsRun += 1;
act({
  kind: "tool",
  name: fname,
  label,
  detail,
  args: fargs,
  status: "done",
  output: String(output).slice(0, 400),
});
```

Delete `send("chat:tool", ...)`.

- [ ] **Step 5: Confirm + ask activity**

In the `confirm` promise, before waiting:

```typescript
act({
  kind: "confirm",
  token,
  label: labelFor(tool.name),
  tool: { name: tool.name, description: tool.description },
  args,
});
```

Still `send("chat:tool-confirm", { id, token, tool, args })` for the handshake.

If `ask` is missing from the execute context, add:

```typescript
const ask = (payload) =>
  new Promise((resolve) => {
    const token = Math.random().toString(36).slice(2);
    pendingAsks.set(token, resolve);
    act({ kind: "status", text: "Waiting for your answer…" });
    act({ kind: "ask", token, question: payload.question, options: payload.options || [] });
    send("chat:ask", { id, token, ...payload });
    // abort listener if abort controller exists in this handler
  });
```

Pass `ask` into `toolsExec.execute` / skills execute context (same shape `exec.ts` already expects). If `pendingAsks` / `chat:ask-reply` are not registered in this tree, add them next to the existing `chat:tool-confirm-reply` handler — renderer already calls `onAsk` / `replyAsk`.

- [ ] **Step 6: Emit `done` before `chat:done` / on error**

```typescript
const thoughtMs = thought.totalMs();
const summary = /* use same rules as buildSummary — duplicate small helper in main or inline */;
act({ kind: "done", thoughtMs, toolCount: toolsRun, summary });
```

Inline summary helper in main to avoid cross-bundle import:

```typescript
function summaryOf(thoughtMs: number, toolCount: number): string {
  const thought = thoughtMs < 1500 ? "Thought briefly" : `Thought for ${Math.round(thoughtMs / 1000)}s`;
  if (!toolCount) return thought;
  return `${thought} · ${toolCount} tool${toolCount === 1 ? "" : "s"}`;
}
```

On catch / abort path, still emit `done` with partial totals when possible.

- [ ] **Step 7: Typecheck**

Run: `cd app && bun run typecheck`  
Expected: PASS for main (renderer may still reference `onToolEvent` until Task 5)

- [ ] **Step 8: Commit** (only if user asked)

```bash
git add src/main/ipc.ts
git commit -m "feat: emit chat:activity from agent loop"
```

---

### Task 4: Preload `onActivity`

**Files:**
- Modify: `preload.ts`
- Modify: `src/types/api.d.ts` (add `onActivity` if not done in Task 1)

**Interfaces:**
- Produces: `window.api.onActivity(cb): Unsubscribe`

- [ ] **Step 1: Add preload subscription**

```typescript
onActivity: (cb) => {
  const fn = (_e, m) => cb(m);
  ipcRenderer.on("chat:activity", fn);
  return () => ipcRenderer.removeListener("chat:activity", fn);
},
```

- [ ] **Step 2: Typecheck**

Run: `cd app && bun run typecheck`  
Expected: `onActivity` present on `AnyLmApi`

- [ ] **Step 3: Commit** (only if user asked)

```bash
git add preload.ts src/types/api.d.ts
git commit -m "feat: expose onActivity via preload"
```

---

### Task 5: Inline activity trail + wire turns + rail

**Files:**
- Create: `src/renderer/js/activity-trail.ts`
- Modify: `src/renderer/js/turns.ts`
- Modify: `src/renderer/js/rail/index.ts`
- Modify: `src/renderer/styles.css`
- Delete or stop importing: `src/renderer/js/rail/labels.ts` (labels now on events)

**Interfaces:**
- Consumes: `applyActivity`, `formatThought`, `buildSummary`, `toolCountOf`, `onActivity`
- Produces:
  - `createTrailHost(): HTMLElement`
  - `paintTrail(host: HTMLElement, events: ActivityEvent[], opts: { live: boolean; thoughtTickMs?: number; onAllow?: (token: string) => void; onDeny?: (token: string) => void }): void`
  - `paintCollapsed(host: HTMLElement, activity: MessageActivity): void` — click toggles expand

- [ ] **Step 1: Implement trail DOM in `activity-trail.ts`**

Structure:

```html
<div class="activity-trail">
  <!-- live rows -->
  <div class="act-row act-thinking">Thought for 3s</div>
  <div class="act-row act-status">Generating…</div>
  <div class="act-row act-tool">
    <button class="act-tool-toggle">Searching the web</button>
    <div class="act-tool-detail">query…</div>
    <pre class="act-tool-out hidden">…</pre>
  </div>
  <div class="act-row act-confirm">
    <span>Allow Writing a document?</span>
    <button data-allow>Allow</button>
    <button data-deny>Deny</button>
  </div>
</div>
```

Live thinking: if last thinking is `phase: "start"`, show `formatThought(thoughtTickMs)` and let the caller pass an updating `thoughtTickMs` via `setInterval` in turns.

Collapsed:

```html
<button class="activity-summary">Thought for 8s · 3 tools</button>
```

Expand replaces with full trail (`live: false` — no Allow/Deny).

- [ ] **Step 2: CSS** — muted 12–13px rows, no cards, expand chevron optional, confirm row with accent Allow

- [ ] **Step 3: Wire `turns.ts`**

On `runTurn`:

1. Create `trailHost` before the bubble; append both into `#messages` (trail then bubble).
2. `turn.events = []`, `turn.trailHost = trailHost`, `turn.activityMeta = null`.
3. In `initTurns`, also `window.api.onActivity((payload) => { ... })`:
   - Resolve turn via `byRequest.get(payload.id)`.
   - Strip `id`, `applyActivity`.
   - On `kind === "done"`, store `turn.activityMeta = { thoughtMs, toolCount, summary, events: turn.events }`.
   - On `kind === "confirm"`, store `turn.pendingConfirm = { token, ... }`.
   - If `activeKey() === turn.key`, `paintTrail(...)`.
4. Local thought ticker: when a thinking start arrives, `setInterval` every 500ms repaint until thinking end.
5. `detachAll`: null `trailHost` (keep `events`).
6. `attachTurn`: recreate trail host + bubble; `paintTrail` from `turn.events`; restore stream seed if needed.
7. On commit success: if `turn.activityMeta`, set `message.activity = turn.activityMeta` (build from events if done was missed).
8. Collapse live trail into summary on turn complete before/as markdown is set — replace trail host contents with `paintCollapsed`.

- [ ] **Step 4: Rail**

```typescript
window.api.onActivity((e) => {
  if (e.kind === "tool" && e.status === "running") {
    startStep(e.name, e.label, e.detail || "");
  } else if (e.kind === "tool" && e.status === "done") {
    finishStep(e.name, String(e.output || "").split("\n")[0].slice(0, 90));
  } else if (e.kind === "status") {
    // optional: noteStep(e.text) — only if it does not spam; prefer tools-only in rail
  }
});
```

Remove `onToolEvent`. Remove imports of `labelFor` / `detailFor` from rail.

- [ ] **Step 5: Remove `onToolEvent` from preload + `api.d.ts`**

- [ ] **Step 6: Typecheck + unit tests**

Run: `cd app && bun run typecheck && bun test src/renderer/js/activity-store.test.ts`  
Expected: PASS

- [ ] **Step 7: Commit** (only if user asked)

```bash
git add src/renderer/js/activity-trail.ts src/renderer/js/turns.ts src/renderer/js/rail/index.ts src/renderer/styles.css preload.ts src/types/api.d.ts
git commit -m "feat: inline activity trail and rail onActivity"
```

---

### Task 6: Sticky Working strip + inline confirm (drop modal)

**Files:**
- Create: `src/renderer/js/working-strip.ts`
- Modify: `src/renderer/index.html` (insert `#working-strip` above `#chat-form` / below ask-dock)
- Modify: `src/renderer/js/turns.ts` / `chat.ts`
- Modify: `src/renderer/styles.css`
- Modify: `src/renderer/js/app.ts` or `chat.ts` to `initWorkingStrip()`

**Interfaces:**
- Produces:
  - `initWorkingStrip(): void`
  - `paintWorkingStrip(state: null | { label: string; confirmToken?: string }): void`

- [ ] **Step 1: HTML**

Inside `#chat-col`, above `#chat-form` (near ask-dock):

```html
<div id="working-strip" class="working-strip hidden" aria-live="polite">
  <div class="working-strip-main">
    <span class="working-strip-title">1 Working</span>
    <span id="working-strip-label" class="working-strip-label"></span>
  </div>
  <div class="working-strip-actions">
    <button type="button" id="working-allow" class="ghost small hidden">Allow</button>
    <button type="button" id="working-deny" class="ghost small hidden">Deny</button>
    <button type="button" id="working-stop" class="ghost small">Stop</button>
  </div>
</div>
```

- [ ] **Step 2: `working-strip.ts`**

- `Stop` → `stopTurn(activeKey())`
- `Allow` / `Deny` → `replyToolConfirm(token, true/false)` and clear pending confirm on turn
- Show only when `activeKey()` has busy turn; hide on idle / other chat
- Label = latest status text or running tool label

- [ ] **Step 3: Call `paintWorkingStrip` from activity handler and on attach/detach**

- [ ] **Step 4: Remove modal confirm for non-document tools in `chat.ts`**

Keep `generate_document` → `showDocConfirm` (spec non-goal). For other tools, do **not** open `#tool-confirm-modal`; activity trail + strip handle Allow/Deny. Remove `tc-allow` / `tc-deny` handlers usage for those tools. Optionally leave modal HTML unused.

When activity `confirm` arrives for `generate_document`, still use file-card permission UI (do not duplicate Allow in trail) — skip painting confirm row if `tool.name === "generate_document"`.

- [ ] **Step 5: Manual smoke** (dev app): enable tools, trigger risky non-doc tool, Allow from strip and Deny from trail.

- [ ] **Step 6: Commit** (only if user asked)

```bash
git add src/renderer/js/working-strip.ts src/renderer/index.html src/renderer/js/chat.ts src/renderer/js/turns.ts src/renderer/styles.css
git commit -m "feat: sticky Working strip and inline tool Allow/Deny"
```

---

### Task 7: History persistence + collapse restore

**Files:**
- Modify: `src/renderer/js/turns.ts` (`commit`)
- Modify: `src/renderer/js/convo.ts` (`renderHistory`)
- Modify: `src/renderer/js/activity-trail.ts` (ensure `paintCollapsed` works read-only)

**Interfaces:**
- Consumes: `MessageActivity` on `ChatMessage`
- Produces: history shows expandable summary when `m.activity` present

- [ ] **Step 1: Persist in `commit`**

```typescript
const message: ChatMessage = { role: "assistant", content: text };
if (turn.activityMeta) message.activity = turn.activityMeta;
else if (turn.events?.length) {
  const thoughtMs = /* sum thinking end ms from events */ 0;
  const toolCount = toolCountOf(turn.events);
  message.activity = {
    thoughtMs,
    toolCount,
    summary: buildSummary(thoughtMs, toolCount),
    events: turn.events,
  };
}
```

Helper to sum thought ms:

```typescript
function thoughtMsOf(events: ActivityEvent[]): number {
  return events
    .filter((e): e is Extract<ActivityEvent, { kind: "thinking" }> => e.kind === "thinking" && e.phase === "end")
    .reduce((n, e) => n + (e.ms || 0), 0);
}
```

Put `thoughtMsOf` in `activity-store.ts` + a unit test.

- [ ] **Step 2: `renderHistory`**

```typescript
if (m.role === "assistant") {
  if (m.activity) {
    const host = document.createElement("div");
    host.className = "activity-trail-host";
    el("messages").appendChild(host);
    paintCollapsed(host, m.activity);
  }
  const bubble = addMessage("assistant", "");
  setBubbleMarkdown(bubble, m.content);
}
```

- [ ] **Step 3: Live complete path** — replace live trail with `paintCollapsed(turn.trailHost, message.activity)` so the open transcript matches history shape.

- [ ] **Step 4: Tests + typecheck**

Run: `cd app && bun test src/renderer/js/activity-store.test.ts && bun run typecheck`  
Expected: PASS

- [ ] **Step 5: Manual checklist**

- [ ] Tools off: thinking row → answer → collapsed summary
- [ ] Tools on: multi-tool trail; rail matches labels
- [ ] Risky tool: Allow/Deny from trail and strip; Stop aborts turn
- [ ] `ask_user`: status “Waiting…” + existing ask card
- [ ] Switch chat mid-turn; return — trail + stream intact
- [ ] Reload chat — collapsed summary expands to stored events (no Allow)
- [ ] `generate_document` still uses permission file card (no duplicate confirm row)

- [ ] **Step 6: Commit** (only if user asked)

```bash
git add src/renderer/js/turns.ts src/renderer/js/convo.ts src/renderer/js/activity-store.ts src/renderer/js/activity-store.test.ts src/renderer/js/activity-trail.ts
git commit -m "feat: persist and restore collapsed activity trails"
```

---

## Spec coverage (self-review)

| Spec requirement | Task |
|------------------|------|
| `chat:activity` channel + event kinds | 1, 2, 3, 4 |
| Labels from main | 2, 3 |
| Remove `chat:tool` | 3, 5 |
| Keep confirm handshake; UI from activity | 3, 6 |
| Inline trail + thinking/status/tools | 5 |
| Collapse under answer | 5, 7 |
| Rail Progress mirror | 5 |
| Sticky Working strip Stop + Allow/Deny | 6 |
| Persist `message.activity` + history | 7 |
| ask status mirror; ask-card unchanged | 3, 5 |
| No CoT / no global strip / doc card unchanged | constraints + Task 6 |

## Placeholder scan

No TBD/TODO left. Confirm vs Stop distinguished. `generate_document` confirm stays on file card.

## Type consistency

- `ActivityEvent` / `MessageActivity` defined in Task 1; used by store, trail, turns, ipc payload shape.
- `onActivity` / `ActivityIpcEvent` in api + preload Task 4.
- `applyActivity` / `buildSummary` / `toolCountOf` / `thoughtMsOf` only in `activity-store.ts`.
