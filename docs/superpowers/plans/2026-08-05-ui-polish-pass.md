# AnyLM UI Polish Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the approved UI polish pass: slim flat sidebar, Settings hub, real OS Open-with + durable file cards, live titles, floating ask + Q&A transcript, complete models list with remove, and a WorkVar-inspired visual refresh.

**Architecture:** Electron renderer (vanilla TS/HTML/CSS) drives UI; new/extended main-process IPC covers OS app discovery, open-with, and file existence. Conversation history gains `artifact` / `ask` message kinds that the paint path rehydrates and that outbound model payloads filter out. Settings becomes a main-pane hub that hosts existing Models/Org/Tools/Skills/Customize surfaces.

**Tech Stack:** Electron 42, TypeScript, vanilla renderer modules under `src/renderer/js/`, CSS tokens in `styles.css`, Bun for build/`bun test`, Ollama via existing `models:*` IPC.

**Spec:** `docs/superpowers/specs/2026-08-05-ui-polish-pass-design.md`

## Global Constraints

- Flat Chats only in sidebar; Projects tree removed; Projects only via Projects button.
- Open-with lists real OS handlers for the file type (not curated-only).
- Settings is a main-pane page with left nav (General, Models, Organization, Tools, Skills, Customize).
- Visual restyle depth B: stronger tokens/surfaces; keep forest-green accent; no WorkVar marketing clone.
- Persist file cards and ask Q&A in the messages array; filter non-LLM roles before model calls.
- Do not change document permission Allow/Deny flow or generation paths.
- Prefer incremental commits; run `bun run typecheck` after each task that touches TS.
- No test runner exists yet — Task 1 introduces `bun test` for pure helpers; UI tasks use typecheck + manual checklist.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `src/renderer/styles.css` | Active pill fix, title alignment, ask-dock, settings hub, visual tokens/surfaces |
| `src/renderer/index.html` | Slim sidebar markup, `#ask-dock`, `#settings-view` shell, remove obsolete nav nodes |
| `src/renderer/js/nav.ts` | View switching including `settings` + section routing |
| `src/renderer/js/app.ts` | Bind Projects + Settings; remove dead nav handlers |
| `src/renderer/js/recents.ts` / `views.ts` | Flat recents without project meta; title paint helper |
| `src/renderer/js/sidebar/*` | Stop rendering project tree (or no-op / delete call sites) |
| `src/renderer/js/settings-hub.ts` (new) | Settings main view left-nav + section show/hide |
| `src/renderer/js/settings.ts` | General section lives in hub (migrate from modal or embed modal content) |
| `src/renderer/js/ask-card.ts` | Render into `#ask-dock` |
| `src/renderer/js/turns.ts` | Live `loadRecents` on title; persist ask artifact; dock lifecycle |
| `src/renderer/js/convo.ts` | `renderHistory` for `artifact` / `ask`; filter helpers for outbound |
| `src/renderer/js/chat.ts` | Persist file artifact on generate; filter messages sent to model |
| `src/renderer/js/file-cards.ts` | OS apps menu; missing state; `renderFileCard` for history |
| `src/renderer/js/models.ts` | List all installed; Remove already wired — fix filter |
| `src/renderer/js/messages.ts` (new) | Pure helpers: `isLlmMessage`, `fileArtifact`, `askArtifact` |
| `src/main/open-with.ts` (new) | OS apps-for / open-with / exists |
| `src/main/project-files.ts` | Reuse `resolveGenerated`; export exists helper |
| `src/main/ipc.ts` / `preload.ts` / `api.d.ts` | Wire new IPC |
| `src/types/domain.d.ts` | Extend stored message union |
| `src/main/open-with.test.ts` / `src/renderer/js/messages.test.ts` | Unit tests |

---

### Task 1: Message helpers + bun test harness

**Files:**
- Create: `src/renderer/js/messages.ts`
- Create: `src/renderer/js/messages.test.ts`
- Modify: `package.json` (add `"test": "bun test"`)
- Modify: `src/types/domain.d.ts` (stored message union)

**Interfaces:**
- Produces:
  - `type StoredMessage = ChatMessage | FileArtifactMessage | AskMessage`
  - `isLlmMessage(m): boolean` — true only for roles the model may see (`system`/`user`/`assistant`/`tool`)
  - `fileArtifact({ name, ext, dir }): FileArtifactMessage`
  - `askArtifact({ question, answer }): AskMessage` — `answer` is `string | null` (null = skipped)
  - `llmMessages(messages): ChatMessage[]`

- [ ] **Step 1: Extend domain types**

In `src/types/domain.d.ts`, after `ChatMessage`:

```ts
interface FileArtifactMessage {
  role: "artifact";
  type: "file";
  name: string;
  ext: string;
  dir: string;
  createdAt: number;
}

interface AskMessage {
  role: "ask";
  question: string;
  /** null means skipped */
  answer: string | null;
}

type StoredMessage = ChatMessage | FileArtifactMessage | AskMessage;
```

Keep `ChatMessage.role` as today for Ollama payloads. Stored chat/thread `messages` arrays become `StoredMessage[]` in types where practical (or leave as `any[]` at store boundary if casting is less churn — prefer updating chat/thread interfaces to `StoredMessage[]`).

- [ ] **Step 2: Write failing tests**

```ts
// src/renderer/js/messages.test.ts
import { describe, expect, test } from "bun:test";
import { isLlmMessage, fileArtifact, askArtifact, llmMessages } from "./messages";

describe("messages helpers", () => {
  test("fileArtifact shape", () => {
    const m = fileArtifact({ name: "a.pdf", ext: ".pdf", dir: "/tmp" });
    expect(m.role).toBe("artifact");
    expect(m.type).toBe("file");
    expect(m.name).toBe("a.pdf");
    expect(typeof m.createdAt).toBe("number");
  });

  test("askArtifact skipped", () => {
    const m = askArtifact({ question: "Topic?", answer: null });
    expect(m.role).toBe("ask");
    expect(m.answer).toBeNull();
  });

  test("llmMessages filters artifact and ask", () => {
    const out = llmMessages([
      { role: "user", content: "hi" },
      fileArtifact({ name: "a.pdf", ext: ".pdf", dir: "/d" }),
      askArtifact({ question: "Q?", answer: "A" }),
      { role: "assistant", content: "ok" },
    ]);
    expect(out.map((m) => m.role)).toEqual(["user", "assistant"]);
  });

  test("isLlmMessage", () => {
    expect(isLlmMessage({ role: "user", content: "x" })).toBe(true);
    expect(isLlmMessage(fileArtifact({ name: "a.pdf", ext: ".pdf", dir: "/d" }))).toBe(false);
  });
});
```

- [ ] **Step 3: Run tests — expect FAIL**

Run: `bun test src/renderer/js/messages.test.ts`  
Expected: FAIL (module missing)

- [ ] **Step 4: Implement helpers**

```ts
// src/renderer/js/messages.ts
export function fileArtifact({ name, ext, dir }: { name: string; ext: string; dir: string }): FileArtifactMessage {
  return { role: "artifact", type: "file", name, ext, dir, createdAt: Date.now() };
}

export function askArtifact({ question, answer }: { question: string; answer: string | null }): AskMessage {
  return { role: "ask", question, answer };
}

export function isLlmMessage(m: StoredMessage): m is ChatMessage {
  return m.role === "system" || m.role === "user" || m.role === "assistant" || m.role === "tool";
}

export function llmMessages(messages: StoredMessage[] | null | undefined): ChatMessage[] {
  return (messages || []).filter(isLlmMessage).map((m) => ({ ...m }));
}
```

- [ ] **Step 5: Add test script and re-run**

In `package.json` scripts: `"test": "bun test"`.

Run: `bun test src/renderer/js/messages.test.ts`  
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add package.json src/types/domain.d.ts src/renderer/js/messages.ts src/renderer/js/messages.test.ts
git commit -m "feat: add stored message helpers and bun tests"
```

---

### Task 2: Fix elongated active-chat highlight

**Root cause:** `.nav-list li > span:first-child { flex: 1 }` now hits `.conv-dot` (added before the title). The 7×7 circle stretches to a horizontal oval; on active rows it shows as the green capsule.

**Files:**
- Modify: `src/renderer/styles.css` (`.nav-list li` / `.conv-dot` / title span)

**Interfaces:** none

- [ ] **Step 1: Fix CSS selectors**

Replace the first-child flex rule so the title grows, not the dot:

```css
.nav-list li > .conv-dot {
  flex: 0 0 auto;
}
.nav-list li > .conv-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
.nav-list li.active {
  background: var(--accent-grad);
  color: var(--accent-contrast);
  border-radius: 10px; /* uniform pill corners */
}
```

Remove or stop applying `flex: 1` to `li > span:first-child`.

- [ ] **Step 2: Add title class in `renderRecents`**

In `src/renderer/js/views.ts` `renderRecents`, change the title span to use class `conv-title`:

```ts
li.appendChild(node("span", "conv-title", it.title || "New chat"));
```

Keep `meta` removed in Task 3; for this task you may leave meta temporarily.

- [ ] **Step 3: Manual verify**

Run: `bun run start` → select a chat → active row is a rounded rectangle/pill with equal corners; no stretched oval on the left.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/styles.css src/renderer/js/views.ts
git commit -m "fix: stop conv-dot flex stretch on active chat row"
```

---

### Task 3: Flatten sidebar (Chats only + Projects button)

**Files:**
- Modify: `src/renderer/index.html` (remove Models/Org/Tools/Skills/Customize buttons; remove Projects tree block)
- Modify: `src/renderer/js/app.ts` (unbind removed nodes; keep Projects)
- Modify: `src/renderer/js/recents.ts` (stop calling `renderTree`)
- Modify: `src/renderer/js/views.ts` (`renderRecents` — no meta)
- Modify: `src/renderer/js/nav.ts` (only `projects-nav` active state from sidebar)
- Modify: `src/renderer/js/sidebar/index.ts` (search only refreshes recents, not tree — or delete tree paint)

**Interfaces:**
- Consumes: existing `loadRecents`
- Produces: sidebar with `#projects-nav` only; `#recents-list` flat titles

- [ ] **Step 1: Slim `index.html` sidebar**

Remove:

```html
<button id="models-nav" ...>
<button id="org-nav" ...>
<button id="tools-nav" ...>
<button id="skills-nav" ...>
<button id="customize-nav" ...>
```

Remove the Projects section block:

```html
<div class="side-section-label">
  <span>Projects</span>
  <button id="side-new-project" ...>
</div>
<ul id="side-projects" ...>
```

Keep `#projects-nav`, search, `#recents-list`, user row. Remove `#open-customize` from user popup (Settings only).

Update search placeholder to `Search chats…`.

- [ ] **Step 2: Update `renderRecents`**

```ts
li.appendChild(node("span", "conv-dot"));
li.appendChild(node("span", "conv-title", it.title || "New chat"));
// do NOT append .meta
```

- [ ] **Step 3: Update `loadRecents` / sidebar init**

In `recents.ts`, remove `await renderTree({ fresh: true })`.

In `sidebar/index.ts` `initSidebar`, on search input call `loadRecents` (import from recents) instead of `renderTree`. Leave `renderTree` exported unused or delete tree paint if nothing else imports it — update `sidebar/tree.ts` call sites accordingly.

- [ ] **Step 4: Fix `app.ts` / `nav.ts` bindings**

Remove onclick for deleted nav IDs and `side-new-project` / `open-customize`. Guard `el(...)` so missing nodes do not throw.

In `nav.ts`, stop toggling removed nav ids:

```ts
for (const id of ["projects-nav"]) {
  const node = el(id);
  if (node) node.classList.toggle("active", id === active);
}
```

Map models/org/tools/skills views to no sidebar highlight (Settings hub owns them in Task 4).

- [ ] **Step 5: Typecheck + manual**

Run: `bun run typecheck`  
Manual: sidebar shows New chat, search, Projects, flat Chats; no project labels; Projects opens grid.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/index.html src/renderer/js/app.ts src/renderer/js/nav.ts src/renderer/js/recents.ts src/renderer/js/views.ts src/renderer/js/sidebar/
git commit -m "feat: flatten sidebar to Projects button and chat list"
```

---

### Task 4: Settings hub (main pane + left nav)

**Files:**
- Modify: `src/renderer/index.html` — add `#settings-view` with left nav + content panes; keep existing `#models-view`, `#org-view`, etc. movable into hub OR show them as hub sections
- Create: `src/renderer/js/settings-hub.ts`
- Modify: `src/renderer/js/nav.ts`, `app.ts`, `settings.ts`, `customize.ts`
- Modify: `src/renderer/styles.css` — settings hub layout

**Interfaces:**
- Produces: `openSettingsHub(section?: "general" | "models" | "org" | "tools" | "skills" | "customize")`
- Consumes: existing `openModelsView`, `openOrgView`, `openToolsView`, `openSkillsView`, customize field paint

**Recommended structure (minimal move):** wrap existing view sections so hub left-nav calls `showView("models")` etc., and `#settings-view` is a shell that either embeds General settings or redirects. Cleaner approach:

```html
<section id="settings-view" class="hidden">
  <aside id="settings-nav">
    <button data-settings="general" class="active">General</button>
    <button data-settings="models">Models</button>
    <button data-settings="org">Organization</button>
    <button data-settings="tools">Tools</button>
    <button data-settings="skills">Skills</button>
    <button data-settings="customize">Customize</button>
  </aside>
  <div id="settings-panels">
    <div id="settings-panel-general">…move contents from #settings-modal…</div>
    <!-- other sections: either relocate existing view roots here, or nest them -->
  </div>
</section>
```

Practical path that avoids huge HTML moves: hub left-nav calls:

| Section | Action |
|---------|--------|
| general | `showView("settings")` + show general panel (migrated from modal) |
| models | `showView("models")` + paint settings-nav active on Models (hub chrome visible) |
| org/tools/skills | same pattern |

Simpler locked approach for implementers: **One `#settings-view` that always shows left nav; right side swaps panels.** Move the inner HTML of `#models-view`, `#org-view`, `#tools-view`, `#skills-view`, and customize modal body into panels inside `#settings-view`. Delete empty old section shells or make them `hidden` forever. Update `showView` to treat `settings` as the only destination; sections via `state.settingsSection`.

- [ ] **Step 1: Add hub markup + CSS**

CSS sketch:

```css
#settings-view {
  display: flex;
  height: 100vh;
  min-height: 0;
}
#settings-nav {
  width: 200px;
  flex-shrink: 0;
  padding: 16px 12px;
  border-right: 1px solid var(--border);
  background: var(--panel);
}
#settings-nav button {
  display: block;
  width: 100%;
  text-align: left;
  padding: 8px 12px;
  border-radius: 8px;
  margin-bottom: 4px;
}
#settings-nav button.active {
  background: var(--accent-grad);
  color: var(--accent-contrast);
}
#settings-panels {
  flex: 1;
  min-width: 0;
  overflow: auto;
}
```

- [ ] **Step 2: Implement `settings-hub.ts`**

```ts
export function openSettingsHub(section = "general") {
  showView("settings");
  selectSettingsSection(section);
}

export function selectSettingsSection(section: string) {
  state.settingsSection = section;
  // toggle panel.hidden + nav button.active
  if (section === "models") openModelsView();
  // … org/tools/skills/customize loaders
}
```

Wire `#open-settings` → `openSettingsHub("general")`. Remove customize modal open from user popup.

- [ ] **Step 3: Update `nav.ts` `showView`**

Toggle `#settings-view` for `view === "settings"`. Hide standalone models/org/tools/skills sections if they were relocated into the hub.

- [ ] **Step 4: Typecheck + manual**

Run: `bun run typecheck`  
Manual: User → Settings → each left-nav section works; Customize only here; Projects still from sidebar.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/index.html src/renderer/styles.css src/renderer/js/settings-hub.ts src/renderer/js/settings.ts src/renderer/js/nav.ts src/renderer/js/app.ts src/renderer/js/customize.ts src/renderer/js/state.ts
git commit -m "feat: add Settings hub with left-nav sections"
```

---

### Task 5: Chat title alignment + live sidebar title refresh

**Files:**
- Modify: `src/renderer/styles.css` / `index.html` — header alignment with chat column
- Modify: `src/renderer/js/turns.ts` — call `loadRecents` after title update
- Modify: `src/renderer/js/views.ts` — optional `paintRecentTitle(key, title)` to avoid full reload flicker

**Interfaces:**
- Consumes: `maybeTitle`, `loadRecents`
- Produces: immediate header + sidebar title update

- [ ] **Step 1: Align header with chat column**

Restructure so title sits above messages, not centered across chat+rail. Preferred HTML:

```html
<section id="convo-view">
  <div id="convo-body">
    <div id="chat-col">
      <header id="convo-header">
        <button id="sidebar-toggle" …>
        <button id="convo-back" …>
        <input id="convo-name" class="name-input" />
      </header>
      <div id="messages"></div>
      …
    </div>
    <aside id="rail">
      <div class="rail-top">
        <button id="rail-toggle" …>
      </div>
      …
    </aside>
  </div>
</section>
```

Ensure `#convo-name` is left-aligned (`text-align: left`), no extra centering. Match horizontal padding to `#messages` (18px).

- [ ] **Step 2: Live title refresh in `commit()`**

In `turns.ts` after successful title persist:

```ts
if (title) {
  await window.api.updateChat(/* or updateThread */, { title });
  if (activeKey() === turn.key) el("convo-name").value = title;
  // Always refresh sidebar so the row updates even if user stays on this tab
  const { loadRecents } = await import("./recents.js");
  await loadRecents();
}
```

Prefer static import at top to avoid dynamic import churn:

```ts
import { loadRecents } from "./recents.js";
```

Watch for circular imports (`recents` → … → `turns`). If cycle appears, extract `paintRecentsTitle` into `views.ts` and mutate `state.recents` + re-render without loading from API:

```ts
export function paintRecentsTitle(key: string, title: string) {
  const it = state.recents?.find((r) => `${r.kind}:${r.id}` === key);
  if (it) it.title = title;
  // re-call renderRecents with current handlers — or update DOM text for matching li
}
```

Locked preference: **update `state.recents` item title + patch DOM** `.conv-title` on `li[data-conv-key="${key}"]` to avoid full list reload flicker; still fine to `loadRecents()` if no cycle.

- [ ] **Step 3: Manual verify**

Start a new chat → get a reply → title updates in header and sidebar without switching tabs. Title sits flush left with message column.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/index.html src/renderer/styles.css src/renderer/js/turns.ts src/renderer/js/views.ts src/renderer/js/recents.ts
git commit -m "fix: left-align chat title and refresh sidebar on rename"
```

---

### Task 6: Floating ask dock + persisted Q&A

**Files:**
- Modify: `src/renderer/index.html` — `#ask-dock` above composer
- Modify: `src/renderer/js/ask-card.ts` — mount into dock
- Modify: `src/renderer/js/turns.ts` — persist `askArtifact`; paint Q+A
- Modify: `src/renderer/js/convo.ts` — render `ask` in history
- Modify: `src/renderer/js/chat.ts` — `llmMessages` when sending
- Modify: `src/renderer/styles.css` — dock pin styles

**Interfaces:**
- Consumes: `askArtifact`, `llmMessages` from Task 1
- Produces: floating ask UI; durable `{ role: "ask", question, answer }`

- [ ] **Step 1: Add dock markup**

Inside `#chat-col`, above `#ctx-meter` / `#chat-form`:

```html
<div id="ask-dock" class="ask-dock hidden"></div>
```

CSS:

```css
.ask-dock {
  flex-shrink: 0;
  padding: 0 18px 8px;
  background: transparent;
}
.ask-dock:not(.hidden) {
  /* visible */
}
.ask-dock .ask-card {
  margin: 0;
  box-shadow: var(--shadow-md);
  border: 1px solid var(--border);
  background: var(--panel);
}
.ask-answered {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.ask-answered-q {
  font-size: 12px;
  color: var(--muted);
}
.ask-answered-a {
  font-size: 12.5px;
  color: var(--text);
}
```

- [ ] **Step 2: Mount ask card in dock**

In `ask-card.ts`:

```ts
export function renderAsk(ask, handlers) {
  clearAsk();
  const dock = el("ask-dock");
  dock.classList.remove("hidden");
  // … build card, append to dock (not #messages)
}
export function clearAsk() {
  clearKeys();
  const dock = el("ask-dock");
  if (dock) {
    dock.innerHTML = "";
    dock.classList.add("hidden");
  }
  for (const card of document.querySelectorAll(".ask-card")) card.remove();
}
```

- [ ] **Step 3: Persist + show Q&A on answer**

In `turns.ts` `answer()`:

```ts
const question = ask.question || "";
const artifact = askArtifact({ question, answer: text });
// persist into conversation messages (same pattern as commit)
await persistStoredMessage(turn, artifact);

if (activeKey() === turn.key) {
  clearAsk();
  appendAskAnswered(question, text);
  …
}
```

`appendAskAnswered`:

```ts
function appendAskAnswered(question: string, text: string | null) {
  const wrap = el("messages");
  const box = node("div", "ask-answered");
  box.appendChild(node("div", "ask-answered-q", question));
  box.appendChild(
    node("div", "ask-answered-a", text == null ? "Skipped" : `You chose: ${text}`)
  );
  wrap.appendChild(box);
}
```

Implement `persistStoredMessage` by reading stored chat/thread, appending, `updateChat`/`updateThread`, and pushing onto `state.chat` when active.

- [ ] **Step 4: History paint + outbound filter**

In `convo.ts` `renderHistory`:

```ts
for (const m of messages || []) {
  if (m.role === "artifact" && m.type === "file") {
    /* Task 7 wires file cards — for now skip or call renderFileCard if already exported */
    continue;
  }
  if (m.role === "ask") {
    appendAskAnswered(m.question, m.answer);
    continue;
  }
  // existing assistant/user handling
}
```

In `chat.ts` when calling `runTurn` / building payload:

```ts
messages: llmMessages(state.chat),
```

Also filter in `titler` / `compact` / summarize paths that send full history.

- [ ] **Step 5: Manual verify**

Ask flow floats above composer; answer shows question + choice; reload chat still shows Q+A; model still responds (artifacts not sent).

- [ ] **Step 6: Commit**

```bash
git add src/renderer/index.html src/renderer/styles.css src/renderer/js/ask-card.ts src/renderer/js/turns.ts src/renderer/js/convo.ts src/renderer/js/chat.ts
git commit -m "feat: pin ask card above composer and persist Q&A"
```

---

### Task 7: OS Open-with IPC

**Files:**
- Create: `src/main/open-with.ts`
- Create: `src/main/open-with.test.ts` (pure path/label helpers)
- Modify: `src/main/project-files.ts` — export `resolveGenerated` or `existsGenerated`
- Modify: `src/main/ipc.ts`, `preload.ts`, `src/types/api.d.ts`

**Interfaces:**
- Produces:
  - `appsForGenerated(dir, name): Promise<{ defaultApp: OpenApp | null, apps: OpenApp[] }>`
  - `openWithGenerated(dir, name, appId: string): Promise<boolean>`
  - `existsGenerated(dir, name): boolean`
  - `OpenApp = { id: string, name: string }`
- Consumes: `resolveGenerated` allowlist

- [ ] **Step 1: Export existence + resolve**

In `project-files.ts`:

```ts
function existsGenerated(dir: string, name: string): boolean {
  return !!resolveGenerated(dir, name);
}
export { …, existsGenerated, resolveGenerated };
```

Note: `resolveGenerated` currently requires file exists; for missing-state UI use a sibling that only checks allowlist path + `fs.existsSync`:

```ts
function generatedPath(dir: string, name: string): string | null {
  // same allowlist as resolveGenerated but without existsSync requirement
}
function existsGenerated(dir: string, name: string): boolean {
  const p = generatedPath(dir, name);
  return !!(p && fs.existsSync(p));
}
```

Refactor `resolveGenerated` to use `generatedPath` + exists.

- [ ] **Step 2: Write open-with helper tests**

```ts
// src/main/open-with.test.ts
import { describe, expect, test } from "bun:test";
import { dedupeApps, sortApps } from "./open-with";

test("dedupeApps by id", () => {
  expect(dedupeApps([
    { id: "a", name: "Preview" },
    { id: "a", name: "Preview" },
    { id: "b", name: "Chrome" },
  ])).toHaveLength(2);
});
```

Export pure `dedupeApps` / `sortApps` from `open-with.ts`.

- [ ] **Step 3: Implement platform apps listing**

`src/main/open-with.ts` sketch:

- **macOS:** given file path, run Swift/Python Launch Services or `mdls` + `lsregister` fallback. Prefer:

```ts
// execFile swift -e '… LSCopyApplicationURLsForURL …'
// return bundle name + bundle id / path
```

Fallback if discovery fails: `{ defaultApp: null, apps: [] }` (UI still has Default app via `shell.openPath`).

- **Windows:** read assoc via `assoc`/`ftype` or PowerShell `Get-StartApps` / `OpenWithList` — best-effort; fallback empty list + default open.
- **Linux:** `xdg-mime query filetype` + `.desktop` handlers — best-effort.

`openWith(appId, filePath)`:

- macOS: `open -b <bundleId> <file>` or `open -a <appName> <file>`
- else: `shell.openPath(filePath)` as fallback

- [ ] **Step 4: Wire IPC + preload**

```ts
ipcMain.handle("pfiles:apps-for", (_e, { dir, name }) => openWith.appsFor(dir, name));
ipcMain.handle("pfiles:open-with", (_e, { dir, name, appId }) => openWith.openWith(dir, name, appId));
ipcMain.handle("pfiles:exists", (_e, { dir, name }) => projectFiles.existsGenerated(dir, name));
```

Preload:

```ts
pfilesAppsFor: (dir, name) => ipcRenderer.invoke("pfiles:apps-for", { dir, name }),
pfilesOpenWith: (dir, name, appId) => ipcRenderer.invoke("pfiles:open-with", { dir, name, appId }),
pfilesExists: (dir, name) => ipcRenderer.invoke("pfiles:exists", { dir, name }),
```

Update `api.d.ts` accordingly.

- [ ] **Step 5: Run unit tests + typecheck**

Run: `bun test src/main/open-with.test.ts && bun run typecheck`

- [ ] **Step 6: Commit**

```bash
git add src/main/open-with.ts src/main/open-with.test.ts src/main/project-files.ts src/main/ipc.ts preload.ts src/types/api.d.ts
git commit -m "feat: IPC for OS open-with apps and file exists"
```

---

### Task 8: File cards — OS apps menu + persistence + File missing

**Files:**
- Modify: `src/renderer/js/file-cards.ts`
- Modify: `src/renderer/js/chat.ts` — persist artifact on generate
- Modify: `src/renderer/js/convo.ts` — rehydrate artifacts
- Modify: `src/renderer/js/chats.ts` / `threads.ts` — save after artifact push if needed
- Modify: `src/renderer/styles.css` — `.doc-file.missing`

**Interfaces:**
- Consumes: Task 1 helpers, Task 7 IPC
- Produces: `renderFileCard(msg | {name,ext,dir}, { missing?: boolean })`

- [ ] **Step 1: Refactor `showFileCard` → `renderFileCard`**

```ts
export async function renderFileCard(
  { name, ext, dir }: { name: string; ext: string; dir: string },
  opts: { missing?: boolean; mount?: HTMLElement } = {}
) {
  const card = node("div", "doc-card doc-file" + (opts.missing ? " missing" : ""));
  // … icon, name, sub
  if (opts.missing) {
    body.appendChild(node("div", "doc-card-sub", "File missing"));
    // no open actions
  } else {
    const { defaultApp, apps } = await window.api.pfilesAppsFor(dir, name).catch(() => ({
      defaultApp: null,
      apps: [],
    }));
    const defaultLabel = defaultApp?.name
      ? `Open with ${defaultApp.name}`
      : "Open with Default app";
    // primary opens default; menu lists defaultApp + other apps + Preview + Show in folder
    for (const app of apps) {
      const item = node("button", "doc-open-item", `Open with ${app.name}`);
      item.onclick = (e) => {
        e.stopPropagation();
        window.api.pfilesOpenWith(dir, name, app.id);
      };
      menu.appendChild(item);
    }
  }
  (opts.mount || messagesEl()).appendChild(card);
}

export function showFileCard(info) {
  return renderFileCard(info);
}
```

- [ ] **Step 2: Persist on generate**

In `chat.ts`:

```ts
window.api.onFileGenerated(async ({ name, ext, dir }) => {
  const artifact = fileArtifact({ name, ext, dir });
  state.chat.push(artifact);
  if (state.mode === "project") await saveThreadMessages();
  else await saveChatMessages();
  if (/* still viewing this convo */) await renderFileCard(artifact);
});
```

Ensure generate only persists for the conversation that triggered it (use turn key / activeKey — if user switched away, still write to the correct chat/thread id from the turn/context; if `onFileGenerated` lacks ids, persist to whatever conversation currently owns the in-flight tool — check main emit payload; extend with `chatId`/`threadId` if missing).

If IPC event has no conversation id, persist to `activeKey()` conversation only when the generate started there; otherwise attach id in main when emitting `onFileGenerated`.

- [ ] **Step 3: Rehydrate in `renderHistory`**

```ts
if (m.role === "artifact" && m.type === "file") {
  const missing = !(await window.api.pfilesExists(m.dir, m.name));
  await renderFileCard(m, { missing });
  continue;
}
```

- [ ] **Step 4: Manual verify**

Generate PDF → menu lists Preview/etc. → restart app → card remains → delete file on disk → reopen chat → “File missing”.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/js/file-cards.ts src/renderer/js/chat.ts src/renderer/js/convo.ts src/renderer/styles.css src/main/
git commit -m "feat: persist file cards with OS apps and missing state"
```

---

### Task 9: Models — show all installed + remove

**Files:**
- Modify: `src/renderer/js/models.ts`
- Modify: `src/renderer/index.html` (models panel copy if needed)

**Interfaces:**
- Consumes: `listModels`, `deleteModel` (already exist)
- Note: Delete button already exists for popular∩installed; gap is installed-only models absent from `POPULAR_MODELS`

- [ ] **Step 1: Change `render()` data source**

```ts
export function render() {
  const query = (el("models-search")?.value || "").toLowerCase();
  const filter = state.modelsFilter || "all";

  const installedCards = [...installedModels].map((name) => ({
    name,
    display: name,
    description: "Installed on this device",
    size: "—",
    installedOnly: true,
  }));

  const catalog = POPULAR_MODELS.filter((m) => !installedModels.has(m.name));

  let rows =
    filter === "installed"
      ? installedCards
      : [...installedCards, ...POPULAR_MODELS]; // popular still show with badge when installed

  // Better UX: Installed section first (all tags), then “Browse” popular not yet installed
  if (filter === "installed") {
    rows = installedCards.filter((m) => !query || m.name.toLowerCase().includes(query));
  } else if (filter === "all") {
    const popular = POPULAR_MODELS.filter(
      (m) => !query || m.display.toLowerCase().includes(query) || m.name.toLowerCase().includes(query)
    );
    // Ensure every installed tag appears even if not in POPULAR_MODELS
    const extra = installedCards.filter((m) => !POPULAR_MODELS.some((p) => p.name === m.name));
    rows = [...extra, ...popular].filter(
      (m) => !query || m.display.toLowerCase().includes(query) || m.name.toLowerCase().includes(query)
    );
  }

  // render cards; installed → Remove (reuse deleteModel)
}
```

Rename button label from `Delete` to `Remove` to match spec copy.

After remove, also refresh composer dropdown: `state.models = await window.api.listModels(); setModelDropdown(...)`.

- [ ] **Step 2: Manual verify**

Install/list many Ollama tags (including ones not in `POPULAR_MODELS`) → all visible under Installed → Remove works.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/js/models.ts
git commit -m "feat: list all installed Ollama models with remove"
```

---

### Task 10: Visual restyle (WorkVar-inspired B)

**Files:**
- Modify: `src/renderer/styles.css` (`:root[data-theme="light"]` tokens + surface rules for `#messages`, cards, models, settings)
- Optionally: `src/renderer/js/theme.ts` if defaults need tweak

**Interfaces:** none

- [ ] **Step 1: Refresh light-theme tokens**

Tune (keep forest green accent):

```css
:root[data-theme="light"] {
  --bg: #f6f5f0;           /* warm paper */
  --panel: #ffffff;
  --panel-2: #eef1ec;      /* soft sage-tint, not dull mid-grey */
  --border: #e0e4dc;
  --text: #1a1c18;
  --muted: #6a6e66;
  --accent: #2e5641;
  /* keep --accent-grad */
  --shadow-sm: 0 1px 2px rgba(26, 28, 24, 0.06);
  --shadow-md: 0 8px 24px rgba(26, 28, 24, 0.08);
}
```

- [ ] **Step 2: Surface rules**

```css
#messages {
  background: transparent;
}
#chat-col {
  background: var(--bg);
}
#rail {
  background: var(--panel);
}
.model-card,
.doc-card,
.ask-card,
.project-card {
  background: var(--panel);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-sm);
}
.msg.assistant {
  background: var(--panel);
  box-shadow: var(--shadow-sm);
}
```

Avoid grey-on-grey: cards on `--bg`, not `--panel-2` slabs. Increase models grid gap slightly (`gap: 14px`).

- [ ] **Step 3: Manual visual pass**

Check chat, sidebar, Settings, Models, Projects — warmer, clearer hierarchy, green accent intact; not purple SaaS; not cream-serif brochure.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/styles.css
git commit -m "style: refresh light surfaces toward quiet WorkVar feel"
```

---

### Task 11: End-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Typecheck + unit tests**

Run:

```bash
bun run typecheck
bun test
```

Expected: all pass.

- [ ] **Step 2: Manual checklist (from spec)**

- [ ] Active chat pill symmetric (no oval stretch)
- [ ] Sidebar: Projects only + flat chats; no project meta; no Models/Org/Tools/Skills/Customize buttons
- [ ] Settings hub opens General/Models/Org/Tools/Skills/Customize
- [ ] Generate PDF/XLSX → Open with lists real apps → open works; Show in folder works
- [ ] Restart → file card persists; delete file → File missing
- [ ] Auto-title updates header + sidebar without tab switch; title left-aligned with messages
- [ ] Ask floats above composer; answer shows question + choice; survives reload
- [ ] Models shows all installed; Remove works
- [ ] Visual: no dull grey-on-grey; accent preserved

- [ ] **Step 3: Final commit if stray fixes**

Only if verification produced small fixes — commit those separately with clear messages.

---

## Spec coverage (self-review)

| Spec item | Task(s) |
|-----------|---------|
| 1 Active pill | Task 2 |
| 2 Open-with OS apps | Tasks 7–8 |
| 3 File persist / missing | Tasks 1, 8 |
| 4 Title align + live summary | Task 5 |
| 5 No project chat org in sidebar | Task 3 |
| 6 Move nav to Settings | Tasks 3–4 |
| 7 Models list + remove | Task 9 |
| 8 Visual restyle B | Task 10 |
| 9 Floating ask | Task 6 |
| 10 Show question after answer | Task 6 |
| Filter artifacts from LLM | Tasks 1, 6, 8 |
| E2E checklist | Task 11 |

## Placeholder / consistency notes

- `OpenApp.id` is the platform key passed to `pfiles:open-with` (bundle id on macOS).
- `StoredMessage` roles `artifact` / `ask` never go to Ollama (`llmMessages`).
- Settings hub must not leave orphaned `#models-nav` references after Task 3.
- If `onFileGenerated` lacks conversation ids, extend the main emit in the same Task 8 commit.
