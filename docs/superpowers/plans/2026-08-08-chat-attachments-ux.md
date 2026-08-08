# Chat Attachments UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show ChatGPT-style attachment previews in the composer and transcript (persisted), drag-and-drop files onto the chat bar, re-inject all conversation attachments into every LLM turn from stored messages, and stop the model picker from submitting the form.

**Architecture:** Pending files live in the composer tray until send. On send, each file becomes a `ChatAttachmentMessage` in `state.chat`, then the user text message. The renderer sends the full `StoredMessage[]` (including attachments) over chat IPC with **no** parallel `attachments` payload. Main process uses `conversationAttachments(messages)` to collect every attachment in this chat/thread, applies docs to the system block and images to the latest user message, and builds the Ollama array from LLM roles only. Project cross-chat context stays on existing memory recall / import-general / project files.

**Tech Stack:** Electron main/renderer TypeScript, Bun tests (`bun:test`), existing chat IPC + JSON chat/thread persistence.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-08-chat-attachments-ux-design.md`
- Persistence: separate `role: "attachment"` messages (not fields on `ChatMessage`)
- Re-inject **all** attachments in this conversation on every request
- Do **not** merge other project threads’ attachment messages; cross-chat stays on project memory settings
- Drop chat IPC `attachments` payload after renderer stops sending it
- Docs store full `text` on history messages; images store `dataUrl`
- No folder DnD; no post-send edit/remove; no new image compression
- Commit steps run only when the user explicitly asks to commit (user rule); otherwise skip commits and leave changes unstaged
- Paths below under `app/` are relative to `app/` unless noted

## File map

| File | Responsibility |
|------|----------------|
| `src/types/domain.d.ts` | `ChatAttachmentMessage`; extend `StoredMessage` |
| `src/types/api.d.ts` | `ChatPayload.messages: StoredMessage[]`; remove `attachments?` |
| `src/renderer/js/messages.ts` | `chatAttachment()` helper |
| `src/renderer/js/messages.test.ts` | Helper + `llmMessages` strips attachments |
| `src/main/chat-attachments.ts` | Pure `conversationAttachments`, `dataUrlToBase64` |
| `src/main/chat-attachments.test.ts` | Full-list collect + skip incomplete |
| `src/main/ipc.ts` | Inject from helper; stop reading IPC `attachments` |
| `preload.ts` | Chat payload typing only if needed (passthrough) |
| `src/renderer/js/attach.ts` | Tray preview, DnD, `classifyDropFile`, `snapshotPending` |
| `src/renderer/js/attach-classify.test.ts` | Classification unit tests |
| `src/renderer/js/chat.ts` | Push attachment messages; drop `attachments` arg |
| `src/renderer/js/turns.ts` | Pass full messages; remove `attachments` from `api.chat` |
| `src/renderer/js/views.ts` | Render attachment row + user bubble helper |
| `src/renderer/js/convo.ts` | `renderHistory` handles `role === "attachment"` |
| `src/renderer/index.html` | `type="button"` on `#model-trigger`; optional drop-hint node |
| `src/renderer/styles.css` | Tray cards/thumbs, drop highlight, transcript cards |

---

### Task 1: Types + `chatAttachment` helper

**Files:**
- Modify: `src/types/domain.d.ts`
- Modify: `src/renderer/js/messages.ts`
- Modify: `src/renderer/js/messages.test.ts`

**Interfaces:**
- Produces:
  - `ChatAttachmentMessage` with `role: "attachment"`, `kind: "image" | "doc"`, `name: string`, optional `dataUrl` / `text`, `createdAt: number`
  - `StoredMessage` includes `ChatAttachmentMessage`
  - `chatAttachment(input): ChatAttachmentMessage`

- [ ] **Step 1: Write the failing tests**

Add to `messages.test.ts`:

```typescript
import { chatAttachment, isLlmMessage, fileArtifact, askArtifact, llmMessages } from "./messages";

test("chatAttachment doc retains text", () => {
  const m = chatAttachment({ kind: "doc", name: "notes.md", text: "hello" });
  expect(m.role).toBe("attachment");
  expect(m.kind).toBe("doc");
  expect(m.name).toBe("notes.md");
  expect(m.text).toBe("hello");
  expect(typeof m.createdAt).toBe("number");
});

test("chatAttachment image keeps dataUrl", () => {
  const m = chatAttachment({
    kind: "image",
    name: "a.png",
    dataUrl: "data:image/png;base64,aaa",
  });
  expect(m.kind).toBe("image");
  expect(m.dataUrl).toBe("data:image/png;base64,aaa");
});

test("llmMessages filters attachment", () => {
  const out = llmMessages([
    chatAttachment({ kind: "doc", name: "a.txt", text: "x" }),
    { role: "user", content: "hi" },
    { role: "assistant", content: "ok" },
  ]);
  expect(out.map((m) => m.role)).toEqual(["user", "assistant"]);
});

test("isLlmMessage false for attachment", () => {
  expect(isLlmMessage(chatAttachment({ kind: "doc", name: "a.txt", text: "x" }))).toBe(false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd app && bun test src/renderer/js/messages.test.ts`

Expected: FAIL — `chatAttachment` not exported / type missing.

- [ ] **Step 3: Add type + helper**

In `domain.d.ts`, after `AskMessage`:

```typescript
interface ChatAttachmentMessage {
  role: "attachment";
  kind: "image" | "doc";
  name: string;
  dataUrl?: string;
  text?: string;
  createdAt: number;
}
```

Update:

```typescript
type StoredMessage = ChatMessage | FileArtifactMessage | AskMessage | ChatAttachmentMessage;
```

In `messages.ts`:

```typescript
export function chatAttachment({
  kind,
  name,
  dataUrl,
  text,
}: {
  kind: "image" | "doc";
  name: string;
  dataUrl?: string;
  text?: string;
}): ChatAttachmentMessage {
  return {
    role: "attachment",
    kind,
    name,
    ...(dataUrl !== undefined ? { dataUrl } : {}),
    ...(text !== undefined ? { text } : {}),
    createdAt: Date.now(),
  };
}
```

`isLlmMessage` stays role-based (`system` | `user` | `assistant` | `tool`) — attachments are already excluded.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd app && bun test src/renderer/js/messages.test.ts`

Expected: PASS

- [ ] **Step 5: Commit** (only if user asked)

```bash
git add app/src/types/domain.d.ts app/src/renderer/js/messages.ts app/src/renderer/js/messages.test.ts
git commit -m "feat(messages): add ChatAttachmentMessage helper"
```

---

### Task 2: `conversationAttachments` (main)

**Files:**
- Create: `src/main/chat-attachments.ts`
- Create: `src/main/chat-attachments.test.ts`

**Interfaces:**
- Consumes: messages shaped like `{ role: string; kind?: string; name?: string; text?: string; dataUrl?: string }`
- Produces:
  - `conversationAttachments(messages) => { docs: { name: string; text: string }[]; images: string[] }`
  - `dataUrlToBase64(dataUrl: string) => string | null`
  - Docs: only `kind === "doc"` with non-empty `text`
  - Images: only `kind === "image"` with usable `dataUrl` → raw base64
  - Order: history order (array order)

- [ ] **Step 1: Write the failing tests**

```typescript
// src/main/chat-attachments.test.ts
import { describe, expect, test } from "bun:test";
import { conversationAttachments, dataUrlToBase64 } from "./chat-attachments";

describe("dataUrlToBase64", () => {
  test("strips prefix", () => {
    expect(dataUrlToBase64("data:image/png;base64,abc123")).toBe("abc123");
  });
  test("null on empty", () => {
    expect(dataUrlToBase64("")).toBeNull();
    expect(dataUrlToBase64("not-a-data-url")).toBeNull();
  });
});

describe("conversationAttachments", () => {
  test("collects all docs and images in order", () => {
    const out = conversationAttachments([
      { role: "attachment", kind: "doc", name: "a.txt", text: "A" },
      { role: "user", content: "first" },
      { role: "assistant", content: "ok" },
      { role: "attachment", kind: "image", name: "b.png", dataUrl: "data:image/png;base64,BBB" },
      { role: "attachment", kind: "doc", name: "c.txt", text: "C" },
      { role: "user", content: "second" },
    ]);
    expect(out.docs).toEqual([
      { name: "a.txt", text: "A" },
      { name: "c.txt", text: "C" },
    ]);
    expect(out.images).toEqual(["BBB"]);
  });

  test("skips incomplete attachments", () => {
    const out = conversationAttachments([
      { role: "attachment", kind: "doc", name: "empty.txt" },
      { role: "attachment", kind: "image", name: "no.png" },
      { role: "user", content: "hi" },
    ]);
    expect(out.docs).toEqual([]);
    expect(out.images).toEqual([]);
  });

  test("ignores non-attachment roles", () => {
    const out = conversationAttachments([
      { role: "user", content: "hi", images: ["should-not-use"] },
      { role: "artifact", type: "file", name: "x.pdf" },
    ]);
    expect(out.docs).toEqual([]);
    expect(out.images).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd app && bun test src/main/chat-attachments.test.ts`

Expected: FAIL — module missing.

- [ ] **Step 3: Implement helper**

```typescript
// src/main/chat-attachments.ts
export function dataUrlToBase64(dataUrl: string): string | null {
  if (!dataUrl || typeof dataUrl !== "string") return null;
  const i = dataUrl.indexOf("base64,");
  if (i === -1) return null;
  const b64 = dataUrl.slice(i + "base64,".length).trim();
  return b64 || null;
}

export function conversationAttachments(messages: any[]): {
  docs: Array<{ name: string; text: string }>;
  images: string[];
} {
  const docs: Array<{ name: string; text: string }> = [];
  const images: string[] = [];
  for (const m of messages || []) {
    if (!m || m.role !== "attachment") continue;
    if (m.kind === "doc") {
      if (typeof m.text === "string" && m.text.length) {
        docs.push({ name: String(m.name || "document"), text: m.text });
      }
    } else if (m.kind === "image") {
      const b64 = dataUrlToBase64(String(m.dataUrl || ""));
      if (b64) images.push(b64);
    }
  }
  return { docs, images };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd app && bun test src/main/chat-attachments.test.ts`

Expected: PASS

- [ ] **Step 5: Commit** (only if user asked)

```bash
git add app/src/main/chat-attachments.ts app/src/main/chat-attachments.test.ts
git commit -m "feat(main): collect conversation attachments for LLM injection"
```

---

### Task 3: Wire IPC injection; remove parallel payload

**Files:**
- Modify: `src/main/ipc.ts` (`chat:start` handler)
- Modify: `src/types/api.d.ts` (`ChatPayload`)
- Modify: `preload.ts` only if it types/destructures `attachments` (passthrough today)

**Interfaces:**
- Consumes: `conversationAttachments` from Task 2
- Produces: chat start accepts `messages: StoredMessage[]` (attachment roles included); no `attachments` field

- [ ] **Step 1: Update `ChatPayload`**

In `api.d.ts`:

```typescript
interface ChatPayload {
  projectId?: string | null;
  threadId?: string | null;
  model: string;
  messages: StoredMessage[];
  useTools?: boolean;
  skillOverrides?: string[];
}
```

Remove the `attachments?: { docs?; images? }` property entirely.

- [ ] **Step 2: Change `chat:start` destructuring**

```typescript
{ id, projectId, threadId, model, messages, useTools, skillOverrides }
```

Near the top of the try block (after `lastUser` is found):

```typescript
import { conversationAttachments } from "./chat-attachments";
// ...
const derived = conversationAttachments(messages);
```

Replace every use of `attachments.docs` / `attachments.images` / `attachments &&` with `derived.docs` / `derived.images` / derived length checks.

Governance loop:

```typescript
for (const d of derived.docs) {
  const v = await governance.evaluatePrompt(d.text || "");
  if (v.blocked) throw new Error(`${v.reason} (attachment "${d.name}")`);
  warnings.push(...v.warnings);
  d.text = v.text;
}
```

Docs block:

```typescript
if (derived.docs.length) {
  const docsBlock = derived.docs
    .map((d) => `Attached document "${d.name}":\n${d.text}`)
    .join("\n\n");
  blocks.push(docsBlock);
  toolInstructionBlocks.push(docsBlock);
}
```

When building `full`, skip non-LLM roles:

```typescript
for (const m of messages) {
  if (m.role === "system" || m.role === "user" || m.role === "assistant" || m.role === "tool") {
    full.push(m);
  }
}
```

Images:

```typescript
if (derived.images.length) {
  for (let i = full.length - 1; i >= 0; i--) {
    if (full[i].role === "user") {
      full[i] = { ...full[i], images: derived.images };
      break;
    }
  }
}
```

`hasAttachments`:

```typescript
hasAttachments: !!(derived.docs.length || derived.images.length),
```

Leave `memory.recall({ projectId, threadId, query })` unchanged — that is the cross-chat project path.

- [ ] **Step 3: Typecheck / run attachment unit tests**

Run: `cd app && bun test src/main/chat-attachments.test.ts src/renderer/js/messages.test.ts`

Expected: PASS

- [ ] **Step 4: Commit** (only if user asked)

```bash
git add app/src/main/ipc.ts app/src/types/api.d.ts app/preload.ts
git commit -m "feat(chat): inject LLM attachments from conversation messages"
```

---

### Task 4: Renderer send path

**Files:**
- Modify: `src/renderer/js/attach.ts` — export `snapshotPending()` / keep `clearAttachments`
- Modify: `src/renderer/js/chat.ts`
- Modify: `src/renderer/js/turns.ts`

**Interfaces:**
- Consumes: `chatAttachment` from Task 1
- Produces: `snapshotPending(): Array<{ kind; name; text?; dataUrl? }>` matching tray state
- `runTurn` / `api.chat` no longer take `attachments`

- [ ] **Step 1: Export snapshot from attach**

```typescript
export function snapshotPending() {
  return attachments.map((a) => ({
    kind: a.kind as "image" | "doc",
    name: a.name as string,
    text: a.text as string | undefined,
    dataUrl: a.dataUrl as string | undefined,
  }));
}
```

Keep `getAttachments` temporarily unused or delete once call sites migrate (prefer delete after chat.ts updated).

- [ ] **Step 2: Update `sendMessage` in `chat.ts`**

```typescript
import { chatAttachment } from "./messages.js";
import { snapshotPending, hasAttachments, clearAttachments } from "./attach.js";
import { addAttachmentMessages, addUserMessage } from "./views.js"; // Task 5 may define addAttachmentMessages; until then inline render via views helper

// inside sendMessage, after model check:
const pending = snapshotPending();
clearAttachments();

input.value = "";
void syncWebResearchHint();

for (const p of pending) {
  const msg = chatAttachment({
    kind: p.kind,
    name: p.name,
    text: p.kind === "doc" ? p.text : undefined,
    dataUrl: p.kind === "image" ? p.dataUrl : undefined,
  });
  state.chat.push(msg);
}
// render attachments + user text (Task 5 helper). Until Task 5 lands, call:
//   renderTurnAttachments(pending); addUserMessage(text);
addUserMessage(text, pending.filter((p) => p.kind === "image").map((p) => p.dataUrl).filter(Boolean));
// Task 5 will replace thumbs-only with full attachment+user grouping including docs.

state.chat.push({ role: "user", content: text });
updateModelLock();

await runTurn({
  key,
  mode: state.mode,
  model,
  messages: state.chat, // full StoredMessage[] including attachments
  useTools: getUseTools(),
  skillOverrides: ...,
  label: ...,
  placeholder: ...,
  projectId,
  threadId,
  chatId: ...,
});
```

Remove `attachments` from the `runTurn` call object.

- [ ] **Step 3: Update `runTurn` chat API call**

In `turns.ts`:

```typescript
const result = await window.api.chat(
  {
    projectId: ctx.projectId,
    threadId: ctx.threadId,
    model: ctx.model,
    messages: ctx.messages, // do NOT llmMessages-filter here — main needs attachment roles
    useTools: ctx.useTools,
    skillOverrides: ctx.skillOverrides || [],
  },
  ...
);
```

Remove `attachments: ctx.attachments`.

- [ ] **Step 4: Grep for leftover `attachments:` chat payload**

Run: `rg "attachments:" app/src/renderer/js app/src/types/api.d.ts app/preload.ts app/src/main/ipc.ts`

Expected: only `ChatContextEvent.attachments` (rail names) and local tray variable names — **not** chat send payload.

- [ ] **Step 5: Commit** (only if user asked)

```bash
git add app/src/renderer/js/attach.ts app/src/renderer/js/chat.ts app/src/renderer/js/turns.ts
git commit -m "feat(renderer): persist attachment messages on send"
```

---

### Task 5: Transcript rendering + history reload

**Files:**
- Modify: `src/renderer/js/views.ts`
- Modify: `src/renderer/js/convo.ts`
- Modify: `src/renderer/js/chat.ts` (use new helpers)
- Modify: `src/renderer/styles.css`

**Interfaces:**
- Produces:
  - `appendAttachmentMessage(m: ChatAttachmentMessage): HTMLElement` — appends thumb or file card into `#messages` (or into an open turn group)
  - Prefer grouping: when rendering history, consecutive attachments before a user message share one visual group

- [ ] **Step 1: Add render helpers in `views.ts`**

```typescript
export function appendAttachmentCard(m: {
  kind: "image" | "doc";
  name: string;
  dataUrl?: string;
}) {
  const wrap = el("messages");
  if (m.kind === "image" && m.dataUrl) {
    let row = wrap.lastElementChild as HTMLElement | null;
    if (!row || !row.classList.contains("msg-attach-row")) {
      row = node("div", "msg-attach-row");
      wrap.appendChild(row);
    }
    const img = document.createElement("img");
    img.className = "msg-thumb";
    img.src = m.dataUrl;
    img.alt = m.name;
    row.appendChild(img);
    wrap.scrollTop = wrap.scrollHeight;
    return row;
  }
  const card = node("div", "msg-file-card");
  card.appendChild(node("span", "msg-file-icon", "📄"));
  card.appendChild(node("span", "msg-file-name", m.name));
  wrap.appendChild(card);
  wrap.scrollTop = wrap.scrollHeight;
  return card;
}

export function addUserMessage(text, images = []) {
  // keep existing image-row behavior OR prefer callers use appendAttachmentCard first
  ...
}
```

CSS (minimal):

```css
.msg-attach-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-self: flex-end;
  max-width: 80%;
}
.msg-file-card {
  align-self: flex-end;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 12px;
  background: var(--panel);
  border: 1px solid var(--border);
  font-size: 13px;
  max-width: 80%;
}
.msg-file-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

- [ ] **Step 2: Update `renderHistory`**

In `convo.ts`, before the generic `addMessage(m.role, m.content)` branch:

```typescript
if (m.role === "attachment") {
  appendAttachmentCard(m);
  continue;
}
```

Import `appendAttachmentCard` from `./views.js`.

For user messages that only have text, keep `addMessage("user", m.content)` or `addUserMessage(m.content)` for consistency with live styling.

- [ ] **Step 3: Update live send rendering in `chat.ts`**

After pushing each `chatAttachment` into `state.chat`, call `appendAttachmentCard(msg)`. Then `addUserMessage(text)` (no need to pass image thumbs if cards already rendered).

- [ ] **Step 4: Manual sanity** (or lightweight DOM test if project already uses jsdom — this repo mostly uses pure helpers; manual OK)

Open a chat, attach a `.md` + image, send, confirm cards appear above the user bubble; reload chat; cards return.

- [ ] **Step 5: Commit** (only if user asked)

```bash
git add app/src/renderer/js/views.ts app/src/renderer/js/convo.ts app/src/renderer/js/chat.ts app/src/renderer/styles.css
git commit -m "feat(ui): show persisted attachment cards in transcript"
```

---

### Task 6: Composer preview tray + drag-and-drop

**Files:**
- Modify: `src/renderer/js/attach.ts`
- Create: `src/renderer/js/attach-classify.test.ts`
- Modify: `src/renderer/index.html` (optional `#composer-drop-hint`)
- Modify: `src/renderer/styles.css`

**Interfaces:**
- Produces: `classifyDropFile(file: { name: string; type?: string }): "image" | "doc" | null`
- Tray UI: image thumbs + doc cards with × remove
- DnD on composer shell (`#attach-chips` parent or `#composer` / form wrapper)

- [ ] **Step 1: Write classification tests**

```typescript
// src/renderer/js/attach-classify.test.ts
import { describe, expect, test } from "bun:test";
import { classifyDropFile } from "./attach";

describe("classifyDropFile", () => {
  test("image by mime", () => {
    expect(classifyDropFile({ name: "x", type: "image/png" })).toBe("image");
  });
  test("image by extension", () => {
    expect(classifyDropFile({ name: "shot.JPEG", type: "" })).toBe("image");
  });
  test("doc by TEXT_EXT", () => {
    expect(classifyDropFile({ name: "notes.md", type: "text/markdown" })).toBe("doc");
  });
  test("unsupported", () => {
    expect(classifyDropFile({ name: "a.pdf", type: "application/pdf" })).toBeNull();
    expect(classifyDropFile({ name: "a.zip", type: "" })).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `cd app && bun test src/renderer/js/attach-classify.test.ts`

Expected: FAIL — export missing.

- [ ] **Step 3: Implement classify + restyle tray + DnD**

```typescript
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|svg)$/i;

export function classifyDropFile(file: { name: string; type?: string }): "image" | "doc" | null {
  if (file.type && file.type.startsWith("image/")) return "image";
  if (IMAGE_EXT.test(file.name)) return "image";
  if (TEXT_EXT.test(file.name)) return "doc";
  return null;
}
```

Replace `renderChips` with ChatGPT-style preview:

- image → `<img class="attach-thumb">` + ×  
- doc → file card (icon + name) + ×  

Wire DnD on a stable shell element (prefer parent of `#attach-chips` + `#chat-form`, e.g. wrap both if needed, or use `#chat-form`’s parent). On `dragover`/`dragenter`: `preventDefault`, add class `composer-drop-active`. On `drop`: `preventDefault`, for each file `classifyDropFile` → `addImageFile` / `addDocFile`; count skips; optional status text; `renderChips()`.

Doc read errors: try/catch around `addDocFile`, skip file.

- [ ] **Step 4: CSS**

```css
.attach-chips { /* existing flex */ gap: 8px; }
.attach-preview {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--panel-2);
}
.attach-thumb {
  width: 56px;
  height: 56px;
  object-fit: cover;
  border-radius: 8px;
  display: block;
}
.composer-drop-active {
  outline: 2px dashed var(--accent, var(--border));
  outline-offset: 4px;
}
```

- [ ] **Step 5: Run classification tests**

Run: `cd app && bun test src/renderer/js/attach-classify.test.ts`

Expected: PASS

- [ ] **Step 6: Commit** (only if user asked)

```bash
git add app/src/renderer/js/attach.ts app/src/renderer/js/attach-classify.test.ts app/src/renderer/styles.css app/src/renderer/index.html
git commit -m "feat(composer): attachment preview tray and drag-drop"
```

---

### Task 7: Model picker `type="button"` fix

**Files:**
- Modify: `src/renderer/index.html`

**Interfaces:**
- Produces: `#model-trigger` has `type="button"` so it never submits `#chat-form`

- [ ] **Step 1: Patch HTML**

Change:

```html
<button
  id="model-trigger"
  class="dropdown-trigger"
  aria-haspopup="listbox"
  aria-expanded="false"
>
```

To:

```html
<button
  type="button"
  id="model-trigger"
  class="dropdown-trigger"
  aria-haspopup="listbox"
  aria-expanded="false"
>
```

Audit siblings in `#chat-form`: `attach-btn`, `tools-toggle`, `workspace-btn` already `type="button"`; `send-btn` stays `type="submit"`.

- [ ] **Step 2: Grep confirmation**

Run: `rg -n "id=\"model-trigger\"" -A6 app/src/renderer/index.html`

Expected: line includes `type="button"`.

- [ ] **Step 3: Commit** (only if user asked)

```bash
git add app/src/renderer/index.html
git commit -m "fix(composer): model picker button type to prevent submit"
```

---

### Task 8: End-to-end verification

**Files:** none new (manual + automated suite)

- [ ] **Step 1: Run unit suite for touched areas**

Run:

```bash
cd app && bun test src/renderer/js/messages.test.ts src/main/chat-attachments.test.ts src/renderer/js/attach-classify.test.ts
```

Expected: all PASS

- [ ] **Step 2: Manual checklist**

1. Type text, open model picker → menu opens, message **not** sent  
2. Drag `.md` + `.png` onto composer → tray shows file card + thumb; remove works  
3. Send → transcript shows card + thumb above user bubble; model receives docs (ask “summarize the attached doc”)  
4. Send a follow-up with no new files → model still knows earlier doc content  
5. Reload chat → cards/thumbs restore  
6. In a project with memory settings from creation, confirm other-thread context still comes from memory (no change expected); attachments stay per-thread  

- [ ] **Step 3: Final commit** (only if user asked) after any leftover fixes

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| `ChatAttachmentMessage` + full doc `text` | 1, 4 |
| Visible after send + persist on reload | 4, 5 |
| Composer ChatGPT preview | 6 |
| Drag-and-drop | 6 |
| Drop parallel IPC `attachments` | 3, 4 |
| Re-inject all conversation attachments each turn | 2, 3 |
| Project cross-chat via existing memory only | 3 (leave recall), 8 |
| Model picker submit bug | 7 |
| Tests listed in spec | 1, 2, 6, 8 |
