# Tools Toggle, Persistence & Model-Lock Affordance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Label the composer Tools toggle, remember tools across a project (existing + new threads), prompt for a new-general-chat default when enabling/disabling tools in standalone chats, and show a disabled model picker with a clear hover/focus popover after a conversation has started.

**Architecture:** Add `Project.defaultUseTools` and `AppSettings.defaultUseToolsForChats`. A main-process `setDefaultUseTools` atomically sets the project flag and patches every thread’s `useTools`. New threads/chats seed from those defaults. Composer toggle clicks use a scope-aware handler (project: silent bulk; general: choice modal). Model lock keeps `updateModelLock()` and adds a small popover with prioritized copy. Pure helpers stay unit-tested; DOM/IPC wiring stays thin.

**Tech Stack:** Electron main/renderer TypeScript, existing JSON project/chat/settings stores, Bun tests (`bun:test`), existing modal overlay patterns (`prompt-modal`).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-08-tools-toggle-model-lock-design.md`
- Project tools on/off → **all threads in that project** (existing + new); never touch general chats
- General “all” → default for **new** standalone chats only; never rewrite existing chats
- Ask on **every** general-chat tools **enable**; ask on disable only when `defaultUseToolsForChats` is true
- Tools label: icon + visible text **“Tools”**
- Model popover priority: conversation started wins over project `modelLocked`
- Auto-enable paths (e.g. web-research hint) → current conversation only; no scope prompts / no defaults
- Commit steps run only when the user explicitly asks to commit (user rule); otherwise skip commits and leave changes unstaged
- Paths below under `app/` are relative to `app/` unless noted

## File map

| File | Responsibility |
|------|----------------|
| `src/types/domain.d.ts` | `defaultUseTools` on `Project`; `defaultUseToolsForChats` on `AppSettings` |
| `src/main/settings.ts` | Default `defaultUseToolsForChats: false` |
| `src/main/project-tools.ts` | Pure `applyProjectDefaultUseTools(project, enabled)` |
| `src/main/project-tools.test.ts` | Bulk on/off + archived threads still patched |
| `src/main/store.ts` | `setDefaultUseTools`; seed `useTools` in `createThread` |
| `src/main/chats.ts` | Seed `useTools` from settings on create |
| `src/main/chat-tools-seed.ts` | Pure `resolveNewChatUseTools(explicit, defaultFlag)` |
| `src/main/chat-tools-seed.test.ts` | Explicit vs default seeding |
| `src/main/ipc.ts` | `projects:setDefaultUseTools` handler |
| `preload.ts` + `src/types/api.d.ts` | `setProjectDefaultUseTools(id, enabled)` |
| `src/renderer/js/tools-scope-prompt.ts` | Two-choice (+ cancel) modal API |
| `src/renderer/js/tools-toggle.ts` | Label sync + `toggleUseTools()` scope orchestration |
| `src/renderer/js/chat.ts` | Bind click to `toggleUseTools` |
| `src/renderer/js/model-lock-message.ts` | Pure popover copy helper |
| `src/renderer/js/model-lock-message.test.ts` | Priority of started vs projectLocked |
| `src/renderer/js/dropdown.ts` + `convo.ts` | Disabled popover on hover/focus |
| `src/renderer/index.html` + `styles.css` | Tools label, scope modal, model popover |
| `src/renderer/js/app.ts` | `initToolsScopePrompt()` |

---

### Task 1: Types + settings default

**Files:**
- Modify: `src/types/domain.d.ts` (`AppSettings`, `Project`)
- Modify: `src/main/settings.ts` (`DEFAULTS`)

**Interfaces:**
- Produces: `AppSettings.defaultUseToolsForChats: boolean` (default `false`); `Project.defaultUseTools?: boolean`

- [ ] **Step 1: Add fields to `domain.d.ts`**

In `AppSettings`, after `lastModel: string;`:

```typescript
  /** Default `useTools` for newly created standalone (non-project) chats. */
  defaultUseToolsForChats: boolean;
```

In `Project`, after `modelLocked?: boolean;`:

```typescript
  /** When true, threads in this project default to tools on (existing + new). */
  defaultUseTools?: boolean;
```

- [ ] **Step 2: Add default in `settings.ts`**

In `DEFAULTS`, after `lastModel: ""`:

```typescript
  defaultUseToolsForChats: false,
```

- [ ] **Step 3: Typecheck**

Run: `cd app && bun run typecheck`  
Expected: PASS (no callers required yet; optional field + settings merge via `{ ...DEFAULTS, ...saved }` already covers the new key)

- [ ] **Step 4: Commit** (only if user asked)

```bash
git add app/src/types/domain.d.ts app/src/main/settings.ts
git commit -m "feat: add defaultUseTools settings fields"
```

---

### Task 2: Project defaultUseTools pure helper + store + IPC

**Files:**
- Create: `src/main/project-tools.ts`
- Create: `src/main/project-tools.test.ts`
- Modify: `src/main/store.ts`
- Modify: `src/main/ipc.ts`
- Modify: `preload.ts`
- Modify: `src/types/api.d.ts`

**Interfaces:**
- Consumes: `Project.defaultUseTools`, `ProjectThread.useTools`
- Produces:
  - `applyProjectDefaultUseTools(project: Project, enabled: boolean): Project` — mutates/returns same project: sets `defaultUseTools`, sets every thread’s `useTools` (including archived)
  - `store.setDefaultUseTools(pid: string, enabled: boolean): PublicProject | null`
  - `window.api.setProjectDefaultUseTools(id: string, enabled: boolean): Promise<PublicProject | null>`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/main/project-tools.test.ts
import { describe, expect, test } from "bun:test";
import { applyProjectDefaultUseTools } from "./project-tools";

function sampleProject(): Project {
  return {
    id: "p1",
    name: "Demo",
    instructions: "",
    model: "m",
    folderPath: "",
    contexts: [],
    archived: false,
    importGeneral: false,
    exportToGeneral: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    threads: [
      {
        id: "t1",
        title: "A",
        folderId: null,
        messages: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        useTools: false,
      },
      {
        id: "t2",
        title: "B",
        folderId: null,
        messages: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        archived: true,
        useTools: true,
      },
    ],
  };
}

describe("applyProjectDefaultUseTools", () => {
  test("turns on default and all threads including archived", () => {
    const p = applyProjectDefaultUseTools(sampleProject(), true);
    expect(p.defaultUseTools).toBe(true);
    expect(p.threads!.every((t) => t.useTools === true)).toBe(true);
  });

  test("turns off default and all threads", () => {
    const p = applyProjectDefaultUseTools(sampleProject(), false);
    expect(p.defaultUseTools).toBe(false);
    expect(p.threads!.every((t) => t.useTools === false)).toBe(true);
  });

  test("handles missing threads array", () => {
    const base = sampleProject();
    delete (base as { threads?: ProjectThread[] }).threads;
    const p = applyProjectDefaultUseTools(base, true);
    expect(p.defaultUseTools).toBe(true);
    expect(p.threads || []).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `cd app && bun test src/main/project-tools.test.ts`  
Expected: FAIL (module not found)

- [ ] **Step 3: Implement pure helper**

```typescript
// src/main/project-tools.ts
export function applyProjectDefaultUseTools(project: Project, enabled: boolean): Project {
  const on = !!enabled;
  project.defaultUseTools = on;
  project.threads = project.threads || [];
  for (const t of project.threads) {
    t.useTools = on;
  }
  return project;
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `cd app && bun test src/main/project-tools.test.ts`  
Expected: PASS

- [ ] **Step 5: Wire `store.setDefaultUseTools` and seed `createThread`**

In `store.ts`:

```typescript
import { applyProjectDefaultUseTools } from "./project-tools";

function setDefaultUseTools(pid: string, enabled: boolean): PublicProject | null {
  const projects = readAll();
  const p = projects.find((x) => x.id === pid);
  if (!p) return null;
  applyProjectDefaultUseTools(p, enabled);
  writeAll(projects);
  return getPublic(pid);
}

// In createThread, after building `thread`:
  const thread: ProjectThread = {
    id: id(),
    title: title || "New chat",
    folderId: folderId || null,
    messages: [],
    createdAt: now,
    updatedAt: now,
    useTools: !!p.defaultUseTools,
  };
```

Also accept explicit `useTools` from `data` if provided:

```typescript
function createThread(
  pid: string,
  { title, folderId, useTools }: Partial<ProjectThread> = {}
): ProjectThread | null {
  // ...
  useTools: useTools != null ? !!useTools : !!p.defaultUseTools,
```

Export `setDefaultUseTools` from the store export list.

- [ ] **Step 6: IPC + preload + api.d.ts**

`ipc.ts` (near other `projects:` handlers):

```typescript
ipcMain.handle("projects:setDefaultUseTools", (_e, { id, enabled }) =>
  store.setDefaultUseTools(id, !!enabled)
);
```

`preload.ts`:

```typescript
setProjectDefaultUseTools: (id, enabled) =>
  ipcRenderer.invoke("projects:setDefaultUseTools", { id, enabled }),
```

`api.d.ts` (near `updateProject`):

```typescript
setProjectDefaultUseTools(id: string, enabled: boolean): Promise<PublicProject | null>;
```

- [ ] **Step 7: Typecheck + tests**

Run: `cd app && bun test src/main/project-tools.test.ts && bun run typecheck`  
Expected: PASS

- [ ] **Step 8: Commit** (only if user asked)

```bash
git add app/src/main/project-tools.ts app/src/main/project-tools.test.ts app/src/main/store.ts app/src/main/ipc.ts app/preload.ts app/src/types/api.d.ts
git commit -m "feat: project-wide defaultUseTools with bulk thread patch"
```

---

### Task 3: Seed standalone chat `useTools` from settings

**Files:**
- Create: `src/main/chat-tools-seed.ts`
- Create: `src/main/chat-tools-seed.test.ts`
- Modify: `src/main/chats.ts`

**Interfaces:**
- Consumes: `AppSettings.defaultUseToolsForChats`
- Produces: `resolveNewChatUseTools(explicit: boolean | undefined, defaultUseToolsForChats: boolean): boolean`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/main/chat-tools-seed.test.ts
import { describe, expect, test } from "bun:test";
import { resolveNewChatUseTools } from "./chat-tools-seed";

describe("resolveNewChatUseTools", () => {
  test("explicit true wins over default false", () => {
    expect(resolveNewChatUseTools(true, false)).toBe(true);
  });
  test("explicit false wins over default true", () => {
    expect(resolveNewChatUseTools(false, true)).toBe(false);
  });
  test("undefined uses default", () => {
    expect(resolveNewChatUseTools(undefined, true)).toBe(true);
    expect(resolveNewChatUseTools(undefined, false)).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `cd app && bun test src/main/chat-tools-seed.test.ts`  
Expected: FAIL (module not found)

- [ ] **Step 3: Implement + wire `chats.create`**

```typescript
// src/main/chat-tools-seed.ts
export function resolveNewChatUseTools(
  explicit: boolean | undefined,
  defaultUseToolsForChats: boolean
): boolean {
  return explicit != null ? !!explicit : !!defaultUseToolsForChats;
}
```

In `chats.ts`:

```typescript
import * as settings from "./settings";
import { resolveNewChatUseTools } from "./chat-tools-seed";

function create({ title, model, useTools }: Partial<StandaloneChat> = {}): StandaloneChat {
  const all = readAll();
  const now = new Date().toISOString();
  const chat: StandaloneChat = {
    id: id(),
    title: title || "New chat",
    model: model || "",
    messages: [],
    createdAt: now,
    updatedAt: now,
    useTools: resolveNewChatUseTools(useTools, settings.read().defaultUseToolsForChats),
  };
  all.push(chat);
  writeAll(all);
  return chat;
}
```

- [ ] **Step 4: Run tests**

Run: `cd app && bun test src/main/chat-tools-seed.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit** (only if user asked)

```bash
git add app/src/main/chat-tools-seed.ts app/src/main/chat-tools-seed.test.ts app/src/main/chats.ts
git commit -m "feat: seed new chat useTools from settings default"
```

---

### Task 4: Tools scope choice modal

**Files:**
- Modify: `src/renderer/index.html` (add modal near `#prompt-modal`)
- Modify: `src/renderer/styles.css` (only if foot needs stacked actions; prefer existing `.modal` / `.modal-foot`)
- Create: `src/renderer/js/tools-scope-prompt.ts`
- Modify: `src/renderer/js/app.ts` (call `initToolsScopePrompt()`)

**Interfaces:**
- Produces:
  - `type ToolsScopeChoice = "all-new" | "this-chat" | "cancel"`
  - `promptToolsScope(kind: "enable" | "disable-default"): Promise<ToolsScopeChoice>`
  - `initToolsScopePrompt(): void`

- [ ] **Step 1: Add modal markup**

After `#prompt-modal` in `index.html`:

```html
    <!-- Tools scope: all new general chats vs this chat only -->
    <div id="tools-scope-modal" class="modal-overlay hidden">
      <div class="modal">
        <h2 id="tools-scope-title">Keep tools enabled for…?</h2>
        <p id="tools-scope-sub" class="modal-sub"></p>
        <div class="modal-foot tools-scope-foot">
          <button id="tools-scope-cancel" class="ghost" type="button">Cancel</button>
          <button id="tools-scope-this" class="ghost" type="button">Only this chat</button>
          <button id="tools-scope-all" class="primary" type="button">All new non-project chats</button>
        </div>
      </div>
    </div>
```

If `.modal-foot` wraps awkwardly with three buttons, add:

```css
.tools-scope-foot {
  flex-wrap: wrap;
  gap: 8px;
}
```

- [ ] **Step 2: Implement `tools-scope-prompt.ts`**

```typescript
import { el } from "./dom.js";

export type ToolsScopeChoice = "all-new" | "this-chat" | "cancel";

let resolver: ((value: ToolsScopeChoice) => void) | null = null;

function done(value: ToolsScopeChoice) {
  el("tools-scope-modal").classList.add("hidden");
  const r = resolver;
  resolver = null;
  if (r) r(value);
}

export function promptToolsScope(kind: "enable" | "disable-default"): Promise<ToolsScopeChoice> {
  const title = el("tools-scope-title");
  const sub = el("tools-scope-sub");
  if (kind === "enable") {
    title.textContent = "Keep tools enabled for…?";
    sub.textContent =
      "You can turn tools on for this chat only, or make them the default for new non-project chats.";
  } else {
    title.textContent = "Turn tools off for…?";
    sub.textContent =
      "Clear the default for new non-project chats, or turn tools off only in this chat.";
  }
  el("tools-scope-modal").classList.remove("hidden");
  return new Promise((res) => {
    resolver = res;
  });
}

export function initToolsScopePrompt() {
  el("tools-scope-all").onclick = () => done("all-new");
  el("tools-scope-this").onclick = () => done("this-chat");
  el("tools-scope-cancel").onclick = () => done("cancel");
  el("tools-scope-modal").onclick = (e) => {
    if ((e.target as UiElement).id === "tools-scope-modal") done("cancel");
  };
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && resolver) {
      e.preventDefault();
      done("cancel");
    }
  });
}
```

- [ ] **Step 3: Init from `app.ts`**

```typescript
import { initToolsScopePrompt } from "./tools-scope-prompt.js";
// near initPrompt():
initToolsScopePrompt();
```

- [ ] **Step 4: Manual smoke** — open app, call from DevTools:  
  `const { promptToolsScope } = await import('./js/tools-scope-prompt.js')` is optional; wiring verified in Task 5.

- [ ] **Step 5: Commit** (only if user asked)

```bash
git add app/src/renderer/index.html app/src/renderer/styles.css app/src/renderer/js/tools-scope-prompt.ts app/src/renderer/js/app.ts
git commit -m "feat: add tools scope choice modal"
```

---

### Task 5: Tools toggle label + scope-aware click handler

**Files:**
- Modify: `src/renderer/index.html` (`#tools-toggle`)
- Modify: `src/renderer/styles.css` (`.tools-toggle` layout for icon + label)
- Modify: `src/renderer/js/tools-toggle.ts`
- Modify: `src/renderer/js/chat.ts` (`initToolUse` click → `toggleUseTools`)

**Interfaces:**
- Consumes: `promptToolsScope`, `window.api.setProjectDefaultUseTools`, `window.api.setSettings`, `persistConversationPatch` pattern
- Produces:
  - `setUseTools(on, { persist? })` — UI + optional current-conversation persist only (unchanged contract for web-research)
  - `toggleUseTools(): Promise<void>` — user click path with project/general scope rules

- [ ] **Step 1: Update HTML for labeled toggle**

Replace the tools toggle button with:

```html
<button type="button" id="tools-toggle" class="icon-btn tools-toggle" title="Enable tools" aria-label="Enable tools">
  <span class="tools-toggle-icon" aria-hidden="true">⚒</span>
  <span class="tools-toggle-label">Tools</span>
</button>
```

- [ ] **Step 2: CSS**

```css
.tools-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  border: 1px solid transparent;
  color: var(--muted);
  width: auto;
  padding: 0 10px;
}
.tools-toggle-icon {
  font-size: 15px;
  line-height: 1;
}
.tools-toggle-label {
  font-size: 12.5px;
  font-weight: 600;
}
.tools-toggle.active {
  background: var(--accent-grad);
  color: var(--accent-contrast);
  border-color: transparent;
}
```

(Merge with existing `.tools-toggle` / `.active` rules — do not leave duplicates.)

- [ ] **Step 3: Rewrite `tools-toggle.ts` orchestration**

Keep module-level `useTools` + `getUseTools` / `setUseTools` for UI sync and silent persist.

Add:

```typescript
import { promptToolsScope } from "./tools-scope-prompt.js";

export function setUseTools(on: boolean, { persist = true } = {}): void {
  useTools = !!on;
  const toggle = el("tools-toggle");
  if (toggle) {
    toggle.classList.toggle("active", useTools);
    const label = useTools ? "Tools enabled" : "Enable tools";
    toggle.title = label;
    toggle.setAttribute("aria-label", label);
  }
  if (persist) void persistConversationPatch({ useTools });
}

export async function toggleUseTools(): Promise<void> {
  const turningOn = !getUseTools();

  if (state.mode === "project" && state.current) {
    const updated = await window.api.setProjectDefaultUseTools(state.current.id, turningOn);
    if (!updated) return;
    state.current = { ...state.current, ...updated };
    if (state.thread) state.thread = { ...state.thread, useTools: turningOn };
    setUseTools(turningOn, { persist: false });
    return;
  }

  if (state.mode === "chat" && state.current) {
    if (turningOn) {
      const choice = await promptToolsScope("enable");
      if (choice === "cancel") return;
      if (choice === "all-new") {
        await window.api.setSettings({ defaultUseToolsForChats: true });
      }
      setUseTools(true);
      return;
    }

    const settings = await window.api.getSettings();
    if (settings.defaultUseToolsForChats) {
      const choice = await promptToolsScope("disable-default");
      if (choice === "cancel") return;
      if (choice === "all-new") {
        await window.api.setSettings({ defaultUseToolsForChats: false });
      }
      setUseTools(false);
      return;
    }

    setUseTools(false);
    return;
  }

  // No active conversation: toggle UI only (should be rare)
  setUseTools(turningOn, { persist: false });
}
```

- [ ] **Step 4: Bind in `chat.ts`**

```typescript
import { getUseTools, toggleUseTools } from "./tools-toggle.js";
// ...
toggle.onclick = () => {
  void toggleUseTools();
};
```

Remove the old `setUseTools(!getUseTools())` click handler.

Confirm `web-research-hint.ts` still calls `setUseTools(true, { persist: false })` after its own patch — no `toggleUseTools`.

- [ ] **Step 5: Manual check**
  - Project: enable tools → switch thread → still on; create thread → on
  - Project: disable → all threads off
  - General: enable → modal; “all new” → new chat has tools on; old chat without tools stays off
  - General: disable with default on → modal

- [ ] **Step 6: Commit** (only if user asked)

```bash
git add app/src/renderer/index.html app/src/renderer/styles.css app/src/renderer/js/tools-toggle.ts app/src/renderer/js/chat.ts
git commit -m "feat: labeled tools toggle with project and general scope"
```

---

### Task 6: Model-lock popover message + wiring

**Files:**
- Create: `src/renderer/js/model-lock-message.ts`
- Create: `src/renderer/js/model-lock-message.test.ts`
- Modify: `src/renderer/js/dropdown.ts`
- Modify: `src/renderer/js/convo.ts`
- Modify: `src/renderer/index.html` (popover element inside `#model-dropdown` or after trigger)
- Modify: `src/renderer/styles.css`

**Interfaces:**
- Produces:
  - `modelLockPopoverMessage({ started: boolean; projectLocked: boolean }): string | null` — `null` when enabled
  - `setModelDropdownEnabled(value: boolean, reasonMessage?: string | null)`
  - `updateModelLock()` passes the message into the dropdown

- [ ] **Step 1: Write failing tests**

```typescript
// src/renderer/js/model-lock-message.test.ts
import { describe, expect, test } from "bun:test";
import { modelLockPopoverMessage } from "./model-lock-message";

describe("modelLockPopoverMessage", () => {
  test("null when unlocked", () => {
    expect(modelLockPopoverMessage({ started: false, projectLocked: false })).toBeNull();
  });
  test("started wins over project lock", () => {
    expect(modelLockPopoverMessage({ started: true, projectLocked: true })).toBe(
      "Models cannot be changed after conversation has started."
    );
  });
  test("started alone", () => {
    expect(modelLockPopoverMessage({ started: true, projectLocked: false })).toBe(
      "Models cannot be changed after conversation has started."
    );
  });
  test("project lock alone", () => {
    expect(modelLockPopoverMessage({ started: false, projectLocked: true })).toBe(
      "Model is locked for this project."
    );
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `cd app && bun test src/renderer/js/model-lock-message.test.ts`  
Expected: FAIL

- [ ] **Step 3: Implement helper**

```typescript
// src/renderer/js/model-lock-message.ts
export function modelLockPopoverMessage({
  started,
  projectLocked,
}: {
  started: boolean;
  projectLocked: boolean;
}): string | null {
  if (started) return "Models cannot be changed after conversation has started.";
  if (projectLocked) return "Model is locked for this project.";
  return null;
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `cd app && bun test src/renderer/js/model-lock-message.test.ts`  
Expected: PASS

- [ ] **Step 5: HTML + CSS for popover**

Inside `#model-dropdown`, after `#model-trigger`:

```html
<div id="model-lock-popover" class="model-lock-popover hidden" role="tooltip">
  Models cannot be changed after conversation has started.
</div>
```

```css
.model-lock-popover {
  position: absolute;
  left: 0;
  bottom: calc(100% + 8px);
  z-index: 40;
  max-width: 260px;
  padding: 8px 10px;
  font-size: 12px;
  line-height: 1.35;
  color: var(--text);
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
  pointer-events: none;
}
#model-dropdown {
  position: relative;
}
```

(If `#model-dropdown` already has `position`, skip duplicate.)

- [ ] **Step 6: Update `dropdown.ts`**

Extend enabled state with a lock message string:

```typescript
let lockMessage: string | null = null;

function showLockPopover() {
  const tip = el("model-lock-popover");
  if (!tip || !lockMessage) return;
  tip.textContent = lockMessage;
  tip.classList.remove("hidden");
}

function hideLockPopover() {
  el("model-lock-popover")?.classList.add("hidden");
}

export function setModelDropdownEnabled(value: boolean, reasonMessage: string | null = null) {
  enabled = value;
  lockMessage = value ? null : reasonMessage;
  const trigger = el("model-trigger");
  trigger.classList.toggle("disabled", !value);
  trigger.setAttribute("aria-disabled", String(!value));
  if (value) {
    trigger.removeAttribute("aria-describedby");
    hideLockPopover();
  } else if (lockMessage) {
    trigger.setAttribute("aria-describedby", "model-lock-popover");
  }
  if (!value && open) close();
}

// In initModelDropdown, after binding click:
  const trigger = el("model-trigger");
  trigger.addEventListener("mouseenter", () => {
    if (!enabled && lockMessage) showLockPopover();
  });
  trigger.addEventListener("mouseleave", hideLockPopover);
  trigger.addEventListener("focus", () => {
    if (!enabled && lockMessage) showLockPopover();
  });
  trigger.addEventListener("blur", hideLockPopover);
```

Ensure `#model-trigger` is focusable when disabled (keep as `<button>`; do not set `disabled` attribute — that blocks focus/hover tooltips on some platforms). Rely on `enabled` flag + `.disabled` class only (already the pattern).

- [ ] **Step 7: Update `convo.ts` `updateModelLock`**

```typescript
import { modelLockPopoverMessage } from "./model-lock-message.js";

export function updateModelLock() {
  const projectLocked = state.mode === "project" && !!state.current?.modelLocked;
  const started = (state.chat?.length || 0) > 0;
  const enabled = !projectLocked && !started;
  const message = modelLockPopoverMessage({ started, projectLocked });
  setModelDropdownEnabled(enabled, message);
}
```

Also update `openConvo` to pass message when `modelLocked`:

```typescript
  const message = modelLockPopoverMessage({
    started: false,
    projectLocked: !!modelLocked,
  });
  setModelDropdownEnabled(!modelLocked, message);
```

- [ ] **Step 8: Run tests + typecheck**

Run: `cd app && bun test src/renderer/js/model-lock-message.test.ts && bun run typecheck`  
Expected: PASS

- [ ] **Step 9: Manual check**
  - Fresh chat: picker works
  - After first send: picker looks disabled; hover shows “Models cannot be changed after conversation has started.”
  - Project with model locked, empty thread: “Model is locked for this project.”

- [ ] **Step 10: Commit** (only if user asked)

```bash
git add app/src/renderer/js/model-lock-message.ts app/src/renderer/js/model-lock-message.test.ts app/src/renderer/js/dropdown.ts app/src/renderer/js/convo.ts app/src/renderer/index.html app/src/renderer/styles.css
git commit -m "feat: model picker lock popover with clear copy"
```

---

### Task 7: End-to-end verification

**Files:** none new (verification only)

- [ ] **Step 1: Run full relevant tests**

Run:

```bash
cd app && bun test src/main/project-tools.test.ts src/main/chat-tools-seed.test.ts src/renderer/js/model-lock-message.test.ts && bun run typecheck
```

Expected: all PASS

- [ ] **Step 2: Manual checklist from spec**

| # | Scenario | Expected |
|---|----------|----------|
| 1 | Tools toggle shows ⚒ + “Tools” | Visible label |
| 2 | Project: turn tools on | All threads on; new thread on |
| 3 | Project: turn tools off | All threads off; general chats untouched |
| 4 | General: turn on → Cancel | Stays off |
| 5 | General: turn on → Only this chat | This chat on; new chat still off (unless default was already on) |
| 6 | General: turn on → All new… | Setting true; this chat on; **new** chat on; existing other chat unchanged |
| 7 | General: turn off with default on → Only this | This off; new chats still on |
| 8 | General: turn off with default on → All new… | Setting false; this off; new chats off |
| 9 | Web-research auto-enable | Current chat only; no modal |
| 10 | Model after first message | Disabled + started popover |
| 11 | Project modelLocked empty thread | Project-lock popover |

- [ ] **Step 3: Commit** (only if user asked) — squash or leave task commits as created

---

## Spec coverage self-check

| Spec requirement | Task |
|------------------|------|
| Tools label icon + “Tools” | 5 |
| Project on → existing + new | 2, 5 |
| Project off → all project threads | 2, 5 |
| General all = new only | 3, 5 |
| Ask every general enable | 4, 5 |
| Ask disable when default on | 4, 5 |
| Model disabled + popover priority | 6 |
| Auto-enable no scope/default | 5 (setUseTools unchanged) |
| Types/settings fields | 1 |
| Atomic project write | 2 |

## Placeholder scan

No TBD/TODO left. Signatures named consistently: `setProjectDefaultUseTools`, `applyProjectDefaultUseTools`, `toggleUseTools`, `promptToolsScope`, `modelLockPopoverMessage`.
