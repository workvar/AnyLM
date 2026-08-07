# Project Settings Tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the crowded `#project-modal` into three tabs — General, Memory sharing, Context — without changing settings behavior or control IDs.

**Architecture:** Restructure markup in `index.html` into a segmented tab bar + three panels. Add CSS for panel spacing and a slightly wider modal. Wire tab switching in `projects.ts` (same pattern as `initDetailTabs` in `project-files.ts`) and reset to General inside `openProjectSettings()`. Existing handlers in `app.ts` keep working via unchanged element IDs.

**Tech Stack:** Electron renderer, vanilla TypeScript/HTML/CSS under `app/src/renderer/`.

**Spec:** `docs/superpowers/specs/2026-08-07-project-settings-tabs-design.md`

## Global Constraints

- Tabs: **General** · **Memory sharing** · **Context** (exact labels).
- General: name, instructions, model lock, storage folder, auto-log.
- Memory sharing: org share + knowledge flow only.
- Context: context references (+ Add) + list.
- Default tab on every open: **General**.
- Do **not** rename existing control IDs (`project-name-input`, `instructions`, `model-lock`, `org-share`, `auto-log`, `project-location`, `project-location-change`, `project-location-reveal`, `kflow`, `add-context`, `file-input`, `context-list`, `project-modal-close`).
- Layout-only: no IPC / persistence / setting semantics changes.
- Prefer existing `.seg` segmented control styling.
- After TS changes: `cd app && bun run typecheck` (or project-equivalent typecheck script).

---

## File Structure

| File | Responsibility |
|------|----------------|
| `app/src/renderer/index.html` | Tab bar + three panels inside `#project-modal` |
| `app/src/renderer/styles.css` | Modal width, tab bar margin, panel spacing; context list height may shrink slightly |
| `app/src/renderer/js/projects.ts` | `initProjectSettingsTabs()`, `showProjectSettingsTab()`, reset on `openProjectSettings()` |
| `app/src/renderer/js/app.ts` | Call `initProjectSettingsTabs()` once at startup |

---

### Task 1: Restructure `#project-modal` markup into tabs + panels

**Files:**
- Modify: `app/src/renderer/index.html` (the `#project-modal` block, currently ~lines 509–593)

**Interfaces:**
- Produces DOM IDs:
  - `#project-settings-tabs` — `.seg` nav with buttons `data-tab="general" | "memory" | "context"`
  - `#ps-panel-general`, `#ps-panel-memory`, `#ps-panel-context` — panels; general visible, others have `hidden`
- Consumes: none (markup only)
- Unchanged IDs: all form controls listed in Global Constraints

- [ ] **Step 1: Replace the `#project-modal` inner `.modal` contents**

Replace the body of `#project-modal` with this structure (keep the outer overlay/`modal` wrappers). Move fields into the panels per the grouping below. Do not change control `id`s.

```html
    <div id="project-modal" class="modal-overlay hidden">
      <div class="modal modal-project-settings">
        <h2>Project settings</h2>
        <p class="modal-sub">Name, memory, and context for this project.</p>

        <nav class="seg project-settings-tabs" id="project-settings-tabs" aria-label="Project settings sections">
          <button type="button" data-tab="general" class="active">General</button>
          <button type="button" data-tab="memory">Memory sharing</button>
          <button type="button" data-tab="context">Context</button>
        </nav>

        <div class="project-settings-panels">
          <div id="ps-panel-general" class="project-settings-panel" data-panel="general">
            <label class="field-label">Project name</label>
            <input id="project-name-input" class="auth-input" placeholder="Project name" />

            <label class="field-label">Instructions</label>
            <textarea
              id="instructions"
              placeholder="System prompt / background for every chat in this project..."
            ></textarea>

            <div class="setting-row">
              <div class="label">
                Lock model to this project
                <small>Use only this model here; disables the picker.</small>
              </div>
              <label class="switch">
                <input type="checkbox" id="model-lock" />
                <span class="track"><span class="knob"></span></span>
              </label>
            </div>

            <div class="setting-col">
              <div class="label">
                Storage folder
                <small>Where this project's generated files (PDF, Word, slides, spreadsheets, notes) are saved.</small>
              </div>
              <div class="pol-row">
                <input id="project-location" class="auth-input" readonly placeholder="No folder set" />
                <button id="project-location-change" class="ghost small">Change…</button>
                <button id="project-location-reveal" class="ghost small">Show</button>
              </div>
            </div>

            <div class="setting-row">
              <div class="label">
                Auto-log exchanges to folder
                <small>Append every chat exchange to decisions-log.md in the storage folder. Off by default.</small>
              </div>
              <label class="switch">
                <input type="checkbox" id="auto-log" />
                <span class="track"><span class="knob"></span></span>
              </label>
            </div>
          </div>

          <div id="ps-panel-memory" class="project-settings-panel hidden" data-panel="memory">
            <div class="setting-row">
              <div class="label">
                Share knowledge with organization
                <small>Reference docs added here also feed your org's shared knowledge base.</small>
              </div>
              <label class="switch">
                <input type="checkbox" id="org-share" />
                <span class="track"><span class="knob"></span></span>
              </label>
            </div>

            <div class="setting-col">
              <div class="label">
                Knowledge flow
                <small>How this project shares with your general knowledge base.</small>
              </div>
              <div class="kflow" id="kflow">
                <label><input type="radio" name="kflow" value="isolated" /> Isolated</label>
                <label><input type="radio" name="kflow" value="import" /> Import only (in)</label>
                <label><input type="radio" name="kflow" value="export" /> Export only (out)</label>
                <label><input type="radio" name="kflow" value="open" /> Open (both ways)</label>
              </div>
            </div>
          </div>

          <div id="ps-panel-context" class="project-settings-panel hidden" data-panel="context">
            <div class="ctx-head">
              <label class="field-label">Context references</label>
              <button id="add-context" class="ghost small">+ Add</button>
              <input type="file" id="file-input" accept=".txt,.md,.json,.csv,.log" hidden />
            </div>
            <ul id="context-list"></ul>
          </div>
        </div>

        <div class="modal-foot">
          <button id="project-modal-close" class="primary">Done</button>
        </div>
      </div>
    </div>
```

Notes:
- First setting row inside a panel may still have `border-top`; CSS in Task 2 removes the top border on the first `.setting-row` / `.setting-col` in a panel so General does not show a stray line under the textarea.
- Order on General: name → instructions → model lock → storage → auto-log (matches spec).

- [ ] **Step 2: Sanity-check IDs still present**

Run from repo root:

```bash
for id in project-name-input instructions model-lock org-share auto-log project-location project-location-change project-location-reveal kflow add-context file-input context-list project-modal-close project-settings-tabs ps-panel-general ps-panel-memory ps-panel-context; do
  grep -q "id=\"$id\"" app/src/renderer/index.html || echo "MISSING: $id"
done
```

Expected: no `MISSING:` lines.

- [ ] **Step 3: Commit**

```bash
git add app/src/renderer/index.html
git commit -m "$(cat <<'EOF'
feat(ui): split project settings markup into three tabs

Group crowded modal fields into General, Memory sharing, and Context
panels so the layout can switch without changing control IDs.
EOF
)"
```

---

### Task 2: Style tab bar and panels

**Files:**
- Modify: `app/src/renderer/styles.css`

**Interfaces:**
- Consumes: `#project-modal`, `.project-settings-tabs`, `.project-settings-panel`, `.modal-project-settings` from Task 1
- Produces: CSS rules so the tab bar sits under the subtitle, panels don’t double-scroll awkwardly, and “Memory sharing” fits the segment

- [ ] **Step 1: Add project-settings modal CSS**

Near the existing `#project-modal #context-list` / `.modal` rules (around the modal section ~1456 and context list ~477), add:

```css
/* Project settings — tabbed layout */
.modal.modal-project-settings {
  width: 480px;
}
#project-modal .project-settings-tabs {
  display: flex;
  width: 100%;
  margin: 0 0 14px;
}
#project-modal .project-settings-tabs button {
  flex: 1;
  white-space: nowrap;
}
#project-modal .project-settings-panel > .setting-row:first-of-type,
#project-modal .project-settings-panel > .setting-col:first-of-type {
  border-top: none;
  padding-top: 0;
}
#project-modal #context-list {
  max-height: 280px;
  overflow-y: auto;
}
```

If `#project-modal #context-list` already exists, update `max-height` in place rather than duplicating the rule.

- [ ] **Step 2: Visual check (manual)**

Open the app, open project settings (Manage or after create). Confirm:
- Tab bar is full-width under the subtitle
- Only General content is visible
- No double top border under Instructions before Lock model
- Done button remains at the bottom

- [ ] **Step 3: Commit**

```bash
git add app/src/renderer/styles.css
git commit -m "$(cat <<'EOF'
style(ui): polish project settings tab panels

Widen the modal slightly and style the segmented tabs so Memory
sharing fits and panels do not show a stray top border.
EOF
)"
```

---

### Task 3: Wire tab switching and reset on open

**Files:**
- Modify: `app/src/renderer/js/projects.ts`
- Modify: `app/src/renderer/js/app.ts`

**Interfaces:**
- Produces:
  - `export function showProjectSettingsTab(tab: "general" | "memory" | "context"): void`
  - `export function initProjectSettingsTabs(): void` — binds clicks on `#project-settings-tabs button`
- Consumes: DOM from Task 1; `el` / `qsa` from `./dom.js`
- `openProjectSettings()` must call `showProjectSettingsTab("general")` before showing the modal

- [ ] **Step 1: Add tab helpers to `projects.ts`**

Near `openProjectSettings` (around line 300), add:

```ts
const PROJECT_SETTINGS_TABS = ["general", "memory", "context"] as const;
type ProjectSettingsTab = (typeof PROJECT_SETTINGS_TABS)[number];

export function showProjectSettingsTab(tab: ProjectSettingsTab) {
  for (const b of qsa("#project-settings-tabs button")) {
    b.classList.toggle("active", b.dataset.tab === tab);
  }
  for (const id of PROJECT_SETTINGS_TABS) {
    el(`ps-panel-${id}`).classList.toggle("hidden", id !== tab);
  }
}

export function initProjectSettingsTabs() {
  for (const b of qsa("#project-settings-tabs button")) {
    b.onclick = () => {
      const tab = b.dataset.tab as ProjectSettingsTab;
      if (!PROJECT_SETTINGS_TABS.includes(tab)) return;
      showProjectSettingsTab(tab);
    };
  }
}
```

Update `openProjectSettings` so it resets the tab before un-hiding the modal:

```ts
export function openProjectSettings() {
  if (!state.current) return;
  el("project-name-input").value = state.current.name || "";
  el("instructions").value = state.current.instructions || "";
  el("model-lock").checked = !!state.current.modelLocked;
  el("org-share").checked = !!state.current.shareToOrg;
  el("auto-log").checked = !!state.current.autoLog;
  el("project-location").value = state.current.folderPath || "";
  const value = flowValue(state.current);
  for (const r of qsa('#kflow input[name="kflow"]')) {
    r.checked = r.value === value;
  }
  renderContextList(state.current.contexts, removeContext);
  showProjectSettingsTab("general");
  el("project-modal").classList.remove("hidden");
}
```

- [ ] **Step 2: Call `initProjectSettingsTabs` from `app.ts`**

In the import from `./projects.js`, add `initProjectSettingsTabs` to the existing import list (same block that already imports `openProjectSettings` / other project helpers).

In the “Project settings modal” section (near `el("project-modal-close")...`), add once:

```ts
  initProjectSettingsTabs();
```

- [ ] **Step 3: Typecheck**

```bash
cd app && bun run typecheck
```

Expected: exit 0. If the script name differs, use whatever `package.json` defines for typecheck.

- [ ] **Step 4: Manual verification checklist**

1. Create a new project → settings opens on **General**.
2. Click **Memory sharing** → only org share + knowledge flow.
3. Click **Context** → only references + Add; add a file if possible.
4. Edit name / toggle / flow; Done; reopen via Manage → still on **General**, values persisted.
5. Storage Change / Show still work from General.

- [ ] **Step 5: Commit**

```bash
git add app/src/renderer/js/projects.ts app/src/renderer/js/app.ts
git commit -m "$(cat <<'EOF'
feat(ui): wire project settings tab switching

Reset to General on open and toggle panels via the segmented
control so the crowded settings modal is scannable.
EOF
)"
```

---

## Spec coverage (self-review)

| Spec requirement | Task |
|------------------|------|
| 3 tabs General / Memory sharing / Context | Task 1 |
| Memory = org share + knowledge flow | Task 1 |
| Storage + auto-log on General | Task 1 |
| Context = references | Task 1 |
| Default General on open | Task 3 |
| `.seg` pattern | Task 1–2 |
| Unchanged IDs / handlers | Task 1 + existing `app.ts` bindings |
| Modest modal width | Task 2 |
| Manual test plan | Task 3 Step 4 |

No placeholders. No IPC changes.
