# Chat attachments UX: visible history, drag-drop preview, model picker fix

**Date:** 2026-08-08  
**Status:** Approved (design)  
**Approach:** Separate display attachment messages (approach 2)  
**Surfaces:** composer (`attach.ts`, `#chat-form`), transcript (`views.ts`, `convo.ts`), message types (`domain.d.ts`, `messages.ts`), model picker (`index.html`)

## Problem

1. After sending, documents (and reliably visible attachment affordances) are hard to see in the transcript. Images get small thumbs; docs do not appear in the user turn. On reload, attachments are not restored in the UI.
2. The composer has no drag-and-drop and only text chips for pending files — no ChatGPT-style preview.
3. Clicking the model picker while the chat input has text submits the prompt instead of opening the menu (empty input does not send because `sendMessage` bails early).

## Decisions (locked)

| Topic | Choice |
|-------|--------|
| Persistence approach | Separate `ChatAttachmentMessage` display messages (not fields on `ChatMessage`) |
| History visibility | Persisted attachment messages so reopen shows the same cards/thumbs |
| Composer preview | ChatGPT-style: image thumbnails + file cards with remove |
| Doc content | Full doc text stored on history attachment messages; LLM turn reads from those messages |
| LLM injection | Backend derives current-turn docs/images from trailing `attachment` messages (drop parallel IPC `attachments` payload) |
| Drag-and-drop | Whole composer shell; same accept rules as attach menu (no folder DnD) |
| Model picker bug | `#model-trigger` must be `type="button"` inside `#chat-form` |

## Goals

1. After submit, user turns show what was attached (images + docs), ChatGPT-style.
2. Reopening a chat restores those attachment visuals (and doc text in stored messages).
3. Drag files onto the chat bar; show a rich preview tray before send.
4. Model picker opens the menu even when the textarea has content.
5. Single source of truth: stored attachment messages drive both UI history and LLM injection for the current turn.

## Non-goals

- Folder drag-and-drop (folder picker via `+` menu stays).
- Editing or removing attachments after send.
- New image compression / size limits beyond current behavior.
- Re-injecting older history attachments on every later turn (only the trailing group before the latest user message).

---

## 1. Data model & persistence

### New stored message

```ts
interface ChatAttachmentMessage {
  role: "attachment";
  kind: "image" | "doc";
  name: string;
  /** Images: data URL for transcript/composer-parity thumbs */
  dataUrl?: string;
  /** Docs: full file text (same content sent as turn context) */
  text?: string;
  createdAt: number;
}
```

Add to `StoredMessage`. Helper e.g. `chatAttachment(...)` in `messages.ts`.

### Send flow

1. Snapshot pending attaches from the tray (name, kind, `text` / `dataUrl`).
2. For each pending item, `state.chat.push(ChatAttachmentMessage)` (docs include full `text`; images include `dataUrl`).
3. Push `{ role: "user", content }` as today.
4. Clear the composer tray.
5. Call `runTurn` with the full `messages` list (including attachment messages). **Do not** send a separate `attachments` IPC payload.

### LLM / compact / title

`isLlmMessage` / `llmMessages` still exclude `role: "attachment"` from the Ollama chat array itself — attachment content is applied by the main-process injector (docs → system block; images → latest user message), not as chat roles. Compact, title, and summarize stay correct.

### Why store full doc text in history

- Single source of truth for what the model saw that turn (auditable transcript).
- Backend can rebuild the docs context block from messages without a parallel payload.
- Enables future “show contents” / re-use without re-reading a disk file that may have moved.

Images keep `dataUrl` for display; the injector strips the data-URL prefix to base64 for vision models.

---

## 2. Composer: drag-and-drop + preview

### Drop target

The composer shell (form + attach tray). On `dragenter`/`dragover`: dashed highlight and “Drop files to attach”. On `dragleave`/`drop`: clear highlight.

### Classification

| Input | Behavior |
|-------|----------|
| Image MIME / common image extensions | `addImageFile` |
| Existing `TEXT_EXT` docs | `addDocFile` (full text via `file.text()`) |
| Other | Skip; optional one-line status “Skipped N unsupported files” |
| Folders | Not via DnD |

`+` menu paths (image / document / folder / camera) keep working and feed the same tray renderer.

### Preview tray

Restyle `#attach-chips` into ChatGPT-style preview:

- Images: thumbnail + × remove  
- Docs: file card (icon + filename) + × remove  

No second tray.

---

## 3. Transcript rendering

### Live send

Render attachment row(s) above the user text bubble (thumbs for images, file cards for docs) so one turn reads as a single ChatGPT-like group. Prefer one shared render helper used by live send and history.

### History reload

In `renderHistory` (`convo.ts`):

- Handle `role === "attachment"` with the same helper.
- Keep consecutive attachment messages visually grouped with the following user message (no orphan standalone bubbles that look like separate turns).

User-only text without attachments continues to use the existing user bubble path.

---

## 4. Backend LLM injection (from messages)

Replace the chat IPC `attachments?: { docs, images }` path with derivation from the message list.

### Current-turn selection

Walk backward from the latest `role: "user"` message and collect contiguous preceding `role: "attachment"` messages. Stop at the first non-attachment. That group is the **current turn** only. Older attachment messages further back remain for UI history and are **not** re-injected.

### Apply (same effects as today)

| Kind | Behavior |
|------|----------|
| `doc` | Governance on `text`; append “Attached document …” block to system + `toolInstructionBlocks` |
| `image` | Set `images: [base64…]` on the latest user message in the Ollama payload (`dataUrl` → raw base64) |
| Complexity / multi-agent | `hasAttachments` from this derived group, not a separate field |

### API cleanup

- Remove `attachments` from the chat-send IPC args and `api.d.ts` / preload wiring once the renderer no longer passes it.
- Keep a small pure helper (e.g. `currentTurnAttachments(messages)`) unit-tested for walk-back + doc/image split.

### Compatibility

No migration for old chats: they never stored attachment messages, so reopen shows text-only turns as today. New sends use the message-based path only.

---

## 5. Model picker submit bug

**Cause:** `#model-trigger` is a `<button>` inside `#chat-form` without `type="button"`, so HTML defaults it to `submit`. With non-empty input, click submits; with empty input, `sendMessage` returns early so the menu still appears to “work.”

**Fix:** set `type="button"` on `#model-trigger`. Audit other composer controls for the same omission (attach / tools / workspace already use `type="button"`).

No change to `chat-form` `onsubmit` or Enter-to-send behavior.

---

## 6. Error handling

| Case | Behavior |
|------|----------|
| Empty drop / only unsupported | No attach; optional skip status |
| Doc read failure | Skip that file; keep others |
| Attachment-only send (no text) | Allowed (existing) |
| Large images | Current behavior; no new compression this pass |
| Attachment message missing `text` / `dataUrl` | Skip that item for injection; still show name in UI if present |

---

## 7. Testing

- `messages.ts`: helper creates attachment messages; `isLlmMessage` false; `llmMessages` strips them; doc messages retain `text`.
- `currentTurnAttachments`: walks back only contiguous attachments before last user; ignores older ones; splits docs/images.
- Attach / DnD classification: image vs doc vs skip.
- Views / history: attachment + user text grouping on render and reload shape.
- Model trigger is `type="button"` (static HTML or small DOM assertion).
- Chat send path no longer requires/accepts IPC `attachments` (type + call sites).

---

## 8. Implementation touchpoints (expected)

| Area | Files (approx.) |
|------|-----------------|
| Types | `app/src/types/domain.d.ts`, `app/src/types/api.d.ts` |
| Message helpers | `app/src/renderer/js/messages.ts` (+ tests) |
| Attach / DnD / tray | `app/src/renderer/js/attach.ts`, `styles.css`, `index.html` |
| Send | `app/src/renderer/js/chat.ts`, `app/src/renderer/js/turns.ts` |
| Bubbles | `app/src/renderer/js/views.ts` |
| History | `app/src/renderer/js/convo.ts` |
| Model picker | `app/src/renderer/index.html` (`#model-trigger`) |
| Backend injection | `app/src/main/ipc.ts` (+ pure helper module + tests); preload if args change |
