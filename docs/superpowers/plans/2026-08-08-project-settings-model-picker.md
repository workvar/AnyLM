# Project Settings Model Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an always-visible searchable project model picker to Project settings General so users can choose which model lock applies to, flushing `project.model` on Done and discarding on dismiss.

**Architecture:** Extract a DOM-free `ModelMenuState` (list, selection, search filter) so composer and settings each own an instance. Wrap it in `createModelMenu` for DOM IDs. Pure helpers decide seed value, list inclusion of a missing model, and whether Done syncs the composer. Project settings keeps a draft selection; Done persists and optionally syncs; overlay/Esc discards.

**Tech Stack:** Electron renderer TypeScript, existing dropdown CSS, Bun tests (`bun:test`).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-08-project-settings-model-picker-design.md`
- Always show Project model on General (above Lock model)
- Custom searchable dropdown (same UX as composer), not native `<select>`
- Draft in modal; persist `project.model` only on **Done**
- Lock toggle stays immediate-save; do not change lock popover / chat-started rules
- Overlay / Esc dismiss discards draft (no model write)
- Sync composer on Done only when that project is the active open project
- No schema / IPC changes (`Project.model` + `modelLocked` already exist)
- Commit steps run only when the user explicitly asks to commit (user rule); otherwise skip commits and leave changes unstaged
- Paths under `app/` are relative to `app/` unless noted

## File map

| File | Responsibility |
|------|----------------|
| `src/renderer/js/model-menu-state.ts` | DOM-free selection/filter/list helpers + `ModelMenuState` |
| `src/renderer/js/model-menu-state.test.ts` | Independent instances, search, missing-model inclusion |
| `src/renderer/js/project-model-settings.ts` | Seed, sync-composer decision, flush/discard semantics |
| `src/renderer/js/project-model-settings.test.ts` | Seed / sync / flush decision tests |
| `src/renderer/js/dropdown.ts` | `createModelMenu` multi-instance; keep composer wrapper API |
| `src/renderer/index.html` | `#project-model-dropdown` markup above lock row |
| `src/renderer/styles.css` | Settings dropdown width / menu positioning in modal |
| `src/renderer/js/projects.ts` | Seed on open; `flushProjectModelSettings` / `discardProjectModelSettings` |
| `src/renderer/js/app.ts` | Init settings menu; Done flushes; overlay/Esc discards |
| `src/renderer/js/models.ts` | When model list refreshes, update settings menu if modal open (keep draft) |

---

### Task 1: DOM-free model menu state

**Files:**
- Create: `src/renderer/js/model-menu-state.ts`
- Create: `src/renderer/js/model-menu-state.test.ts`

**Interfaces:**
- Produces:
  - `filterModels(models: string[], query: string): string[]`
  - `modelsForPicker(models: string[], selected: string): string[]` — if `selected` non-empty and not in `models`, prepend it
  - `class ModelMenuState` with:
    - `setModels(models: string[], selectedValue?: string): void`
    - `getSelected(): string`
    - `choose(value: string): void`
    - `setQuery(query: string): void`
    - `filtered(): string[]`
    - `getModels(): string[]`

- [ ] **Step 1: Write the failing test**

```typescript
// src/renderer/js/model-menu-state.test.ts
import { describe, expect, test } from "bun:test";
import { ModelMenuState, filterModels, modelsForPicker } from "./model-menu-state";

describe("filterModels", () => {
  test("empty query returns all", () => {
    expect(filterModels(["a", "b"], "")).toEqual(["a", "b"]);
  });
  test("case-insensitive substring", () => {
    expect(filterModels(["Llama3", "mistral"], "lla")).toEqual(["Llama3"]);
  });
});

describe("modelsForPicker", () => {
  test("passes through when selected present", () => {
    expect(modelsForPicker(["a", "b"], "b")).toEqual(["a", "b"]);
  });
  test("prepends missing selected", () => {
    expect(modelsForPicker(["a", "b"], "gone")).toEqual(["gone", "a", "b"]);
  });
  test("empty selected does not prepend", () => {
    expect(modelsForPicker(["a"], "")).toEqual(["a"]);
  });
});

describe("ModelMenuState", () => {
  test("instances are independent", () => {
    const a = new ModelMenuState();
    const b = new ModelMenuState();
    a.setModels(["x", "y"], "x");
    b.setModels(["x", "y"], "y");
    a.choose("y");
    expect(a.getSelected()).toBe("y");
    expect(b.getSelected()).toBe("y");
    b.choose("x");
    expect(a.getSelected()).toBe("y");
    expect(b.getSelected()).toBe("x");
  });

  test("setModels keeps draft when still present", () => {
    const s = new ModelMenuState();
    s.setModels(["a", "b"], "b");
    s.setModels(["b", "c"]); // no selectedValue → keep "b"
    expect(s.getSelected()).toBe("b");
    expect(s.getModels()).toEqual(["b", "c"]);
  });

  test("setModels falls back when draft missing", () => {
    const s = new ModelMenuState();
    s.setModels(["a", "b"], "a");
    s.setModels(["c", "d"]); // keep "a" via modelsForPicker prepend? Spec: keep draft if still present.
    // Draft "a" not in list → prepend so selection stays "a"
    expect(s.getSelected()).toBe("a");
    expect(s.getModels()[0]).toBe("a");
  });

  test("search filters", () => {
    const s = new ModelMenuState();
    s.setModels(["alpha", "beta"], "alpha");
    s.setQuery("be");
    expect(s.filtered()).toEqual(["beta"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && bun test src/renderer/js/model-menu-state.test.ts`  
Expected: FAIL (module not found)

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/renderer/js/model-menu-state.ts
export function filterModels(models: string[], query: string): string[] {
  const q = query.trim().toLowerCase();
  return q ? models.filter((m) => m.toLowerCase().includes(q)) : models.slice();
}

export function modelsForPicker(models: string[], selected: string): string[] {
  const list = models.slice();
  if (selected && !list.includes(selected)) list.unshift(selected);
  return list;
}

export class ModelMenuState {
  private models: string[] = [];
  private selected = "";
  private query = "";

  setModels(models: string[], selectedValue?: string): void {
    const base = models || [];
    if (selectedValue !== undefined) {
      this.selected = selectedValue || base[0] || "";
    } else if (!this.selected) {
      this.selected = base[0] || "";
    }
    // Keep draft even if missing from installed list (prepend via modelsForPicker).
    this.models = modelsForPicker(base, this.selected);
  }

  getSelected(): string {
    return this.selected;
  }

  getModels(): string[] {
    return this.models.slice();
  }

  choose(value: string): void {
    if (!value) return;
    this.selected = value;
  }

  setQuery(query: string): void {
    this.query = query;
  }

  filtered(): string[] {
    return filterModels(this.models, this.query);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && bun test src/renderer/js/model-menu-state.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit** (only if user asked)

```bash
git add app/src/renderer/js/model-menu-state.ts app/src/renderer/js/model-menu-state.test.ts
git commit -m "feat: add ModelMenuState for multi-instance pickers"
```

---

### Task 2: Project model settings pure helpers

**Files:**
- Create: `src/renderer/js/project-model-settings.ts`
- Create: `src/renderer/js/project-model-settings.test.ts`

**Interfaces:**
- Consumes: none (pure)
- Produces:
  - `seedProjectModel(projectModel: string | undefined, models: string[]): string`
  - `shouldSyncComposer(args: { mode: string; activeProjectId: string | undefined; settingsProjectId: string }): boolean`

- [ ] **Step 1: Write the failing test**

```typescript
// src/renderer/js/project-model-settings.test.ts
import { describe, expect, test } from "bun:test";
import { seedProjectModel, shouldSyncComposer } from "./project-model-settings";

describe("seedProjectModel", () => {
  test("uses project model when set", () => {
    expect(seedProjectModel("mistral", ["llama", "mistral"])).toBe("mistral");
  });
  test("falls back to first installed", () => {
    expect(seedProjectModel("", ["llama", "mistral"])).toBe("llama");
  });
  test("keeps missing project model string", () => {
    expect(seedProjectModel("gone", ["llama"])).toBe("gone");
  });
  test("empty when no model and no list", () => {
    expect(seedProjectModel("", [])).toBe("");
  });
});

describe("shouldSyncComposer", () => {
  test("true when active project matches", () => {
    expect(
      shouldSyncComposer({ mode: "project", activeProjectId: "p1", settingsProjectId: "p1" })
    ).toBe(true);
  });
  test("false for chat mode", () => {
    expect(
      shouldSyncComposer({ mode: "chat", activeProjectId: "p1", settingsProjectId: "p1" })
    ).toBe(false);
  });
  test("false when different project", () => {
    expect(
      shouldSyncComposer({ mode: "project", activeProjectId: "p2", settingsProjectId: "p1" })
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && bun test src/renderer/js/project-model-settings.test.ts`  
Expected: FAIL (module not found)

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/renderer/js/project-model-settings.ts
export function seedProjectModel(projectModel: string | undefined, models: string[]): string {
  if (projectModel) return projectModel;
  return models[0] || "";
}

export function shouldSyncComposer(args: {
  mode: string;
  activeProjectId: string | undefined;
  settingsProjectId: string;
}): boolean {
  return args.mode === "project" && !!args.activeProjectId && args.activeProjectId === args.settingsProjectId;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && bun test src/renderer/js/project-model-settings.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit** (only if user asked)

```bash
git add app/src/renderer/js/project-model-settings.ts app/src/renderer/js/project-model-settings.test.ts
git commit -m "feat: add project model settings seed/sync helpers"
```

---

### Task 3: Multi-instance `createModelMenu` in dropdown.ts

**Files:**
- Modify: `src/renderer/js/dropdown.ts`
- Modify: any imports still using the singleton API (keep wrappers)

**Interfaces:**
- Consumes: `ModelMenuState`, `filterModels` from `model-menu-state.ts`
- Produces:
  - `createModelMenu(opts: { ids: ModelMenuIds; lockPopoverId?: string }): ModelMenuApi`
  - `ModelMenuApi`: `{ init(onChange?), setModels(list, selected?), getSelected(), setEnabled(enabled, reasonMessage?) }`
  - Keep exports: `initModelDropdown`, `setModelDropdown`, `getSelectedModel`, `setModelDropdownEnabled` as thin wrappers around a composer instance

`ModelMenuIds`:

```typescript
type ModelMenuIds = {
  trigger: string;
  current: string;
  menu: string;
  searchWrap: string;
  search: string;
  options: string;
};
```

Composer ids stay: `model-trigger`, `model-current`, `model-menu`, `model-search-wrap`, `model-search`, `model-options`, lock popover `model-lock-popover`.

- [ ] **Step 1: Refactor `dropdown.ts` to factory**

Rewrite so each menu owns its own `ModelMenuState`, open/highlight/enabled/lockMessage/onChange. Move current singleton body into `createModelMenu`. Composer:

```typescript
const composer = createModelMenu({
  ids: {
    trigger: "model-trigger",
    current: "model-current",
    menu: "model-menu",
    searchWrap: "model-search-wrap",
    search: "model-search",
    options: "model-options",
  },
  lockPopoverId: "model-lock-popover",
});

export function initModelDropdown(onChangeCb) {
  composer.init(onChangeCb);
}
export function setModelDropdown(modelList, selectedValue) {
  composer.setModels(modelList, selectedValue);
}
export function getSelectedModel() {
  return composer.getSelected();
}
export function setModelDropdownEnabled(value, reasonMessage = null) {
  composer.setEnabled(value, reasonMessage);
}

export { createModelMenu };
```

Important behaviors to preserve:
- Search shown when `state.getModels().length > 5`
- Document click closes **this** menu only when open
- Lock popover only when `lockPopoverId` provided and disabled
- Settings instance: no lock popover; always enabled from callers

- [ ] **Step 2: Typecheck**

Run: `cd app && bun run typecheck`  
Expected: PASS

- [ ] **Step 3: Smoke existing model-lock unit tests**

Run: `cd app && bun test src/renderer/js/model-lock-message.test.ts src/renderer/js/model-menu-state.test.ts`  
Expected: PASS

- [ ] **Step 4: Commit** (only if user asked)

```bash
git add app/src/renderer/js/dropdown.ts
git commit -m "refactor: multi-instance createModelMenu for model pickers"
```

---

### Task 4: Markup + styles for Project model picker

**Files:**
- Modify: `src/renderer/index.html` (General panel, above lock row)
- Modify: `src/renderer/styles.css`

**Interfaces:**
- Produces DOM ids: `project-model-dropdown`, `project-model-trigger`, `project-model-current`, `project-model-menu`, `project-model-search-wrap`, `project-model-search`, `project-model-options`

- [ ] **Step 1: Insert markup after Instructions, before Lock model**

Inside `#ps-panel-general`, after the `#instructions` textarea block, before the lock `setting-row`:

```html
            <div class="setting-col project-model-field">
              <div class="label">
                Project model
                <small>Default model for chats in this project.</small>
              </div>
              <div id="project-model-dropdown" class="dropdown project-settings-model">
                <button
                  type="button"
                  id="project-model-trigger"
                  class="dropdown-trigger"
                  aria-haspopup="listbox"
                  aria-expanded="false"
                >
                  <span id="project-model-current" class="dropdown-value">No models</span>
                  <svg class="dropdown-chevrons" width="10" height="16" viewBox="0 0 10 16" aria-hidden="true">
                    <path d="M2.5 6.5 5 4l2.5 2.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
                    <path d="M2.5 9.5 5 12l2.5-2.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
                  </svg>
                </button>
                <div id="project-model-menu" class="dropdown-menu hidden" role="listbox">
                  <div id="project-model-search-wrap" class="dropdown-search hidden">
                    <input id="project-model-search" type="text" placeholder="Search models" autocomplete="off" spellcheck="false" />
                  </div>
                  <ul id="project-model-options" class="dropdown-options"></ul>
                </div>
              </div>
            </div>
```

- [ ] **Step 2: CSS for modal dropdown**

Near `#project-modal` rules in `styles.css`:

```css
#project-modal .project-model-field {
  gap: 8px;
}
#project-modal .project-settings-model {
  width: 100%;
}
#project-modal .project-settings-model .dropdown-trigger {
  width: 100%;
  justify-content: space-between;
}
#project-modal .project-settings-model .dropdown-menu {
  left: 0;
  right: 0;
  min-width: 0;
  width: 100%;
}
```

Adjust if composer `.dropdown-menu` absolute positioning needs `position: relative` on `.project-settings-model` (mirror `.composer-model` if present).

- [ ] **Step 3: Visual check**

Open Project settings in the app (or static HTML review): Project model sits above Lock model; trigger full-width.

- [ ] **Step 4: Commit** (only if user asked)

```bash
git add app/src/renderer/index.html app/src/renderer/styles.css
git commit -m "feat: add project model picker markup in settings"
```

---

### Task 5: Wire seed / flush / discard in projects + app

**Files:**
- Modify: `src/renderer/js/projects.ts`
- Modify: `src/renderer/js/app.ts`
- Modify: `src/renderer/js/dropdown.ts` (export settings menu or create in projects)
- Modify: `src/renderer/js/models.ts` (refresh settings menu when model list updates)

**Interfaces:**
- Consumes: `createModelMenu`, `seedProjectModel`, `shouldSyncComposer`, `setModelDropdown`, `updateModelLock`
- Produces:
  - `initProjectModelPicker(): void`
  - `seedProjectModelPicker(): void` — call from `openProjectSettings`
  - `flushProjectModelSettings(): Promise<void>` — Done
  - `discardProjectModelSettings(): void` — dismiss (clear draft tracking / close menu)

Recommended: create the settings menu once in `projects.ts`:

```typescript
export const projectModelMenu = createModelMenu({
  ids: {
    trigger: "project-model-trigger",
    current: "project-model-current",
    menu: "project-model-menu",
    searchWrap: "project-model-search-wrap",
    search: "project-model-search",
    options: "project-model-options",
  },
});
```

`onChange` for settings menu: no IPC — draft lives in `projectModelMenu.getSelected()` only.

- [ ] **Step 1: Implement seed / flush / discard in `projects.ts`**

```typescript
export function initProjectModelPicker() {
  projectModelMenu.init(() => {
    /* draft only — persisted on Done */
  });
}

export function seedProjectModelPicker() {
  if (!state.current) return;
  const selected = seedProjectModel(state.current.model, state.models);
  projectModelMenu.setModels(state.models, selected);
}

export async function flushProjectModelSettings() {
  if (!state.current) return;
  const model = projectModelMenu.getSelected();
  const patch = { model };
  state.current = { ...state.current, ...patch };
  await window.api.updateProject(state.current.id, patch);
  await loadProjects();
  if (
    shouldSyncComposer({
      mode: state.mode,
      activeProjectId: state.current?.id,
      settingsProjectId: state.current.id,
    })
  ) {
    setModelDropdown(state.models, model);
    updateModelLock();
  }
}

export function discardProjectModelSettings() {
  // Close open menu; draft is abandoned on next open via seed
  projectModelMenu.setEnabled(true); // no-op enable; ensure menu closed via internal close if exposed
}
```

Expose `close()` on `ModelMenuApi` as `closeMenu()` so discard can close an open menu without persisting.

Fix `shouldSyncComposer` call: use the project id being edited **before** any state churn. When Manage opens settings for project A while viewing project A, `state.current` is A. When Done runs, sync if `state.mode === "project" && state.current.id === idJustSaved`.

Also update `state.current.model` for in-memory consistency even when not syncing composer.

- [ ] **Step 2: Call seed from `openProjectSettings`**

At end of `openProjectSettings()`, after filling other fields:

```typescript
  seedProjectModelPicker();
```

- [ ] **Step 3: Wire Done / overlay / Esc in `app.ts`**

Replace:

```typescript
  el("project-modal-close").onclick = () => closeModal("project-modal");
  el("project-modal").onclick = (e) => {
    if ((e.target as UiElement).id === "project-modal") closeModal("project-modal");
  };
```

With:

```typescript
  initProjectModelPicker();

  async function commitAndCloseProjectSettings() {
    await flushProjectModelSettings();
    closeModal("project-modal");
  }
  function dismissProjectSettings() {
    discardProjectModelSettings();
    closeModal("project-modal");
  }

  el("project-modal-close").onclick = () => {
    void commitAndCloseProjectSettings();
  };
  el("project-modal").onclick = (e) => {
    if ((e.target as UiElement).id === "project-modal") dismissProjectSettings();
  };
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (el("project-modal").classList.contains("hidden")) return;
    // If a model menu is open, dropdown keydown already closes it; only dismiss modal when menus closed
    if (!el("project-model-menu").classList.contains("hidden")) return;
    if (!el("model-menu").classList.contains("hidden")) return;
    dismissProjectSettings();
  });
```

Lock `onchange` stays as today (immediate).

- [ ] **Step 4: Refresh settings picker when models list updates**

In `models.ts`, wherever `setModelDropdown(state.models, …)` runs after a list refresh, also:

```typescript
import { refreshProjectModelPickerModels } from "./projects.js";
// ...
refreshProjectModelPickerModels();
```

```typescript
// projects.ts
export function refreshProjectModelPickerModels() {
  if (el("project-modal").classList.contains("hidden")) return;
  projectModelMenu.setModels(state.models); // no selectedValue → keep draft
}
```

- [ ] **Step 5: Typecheck + unit tests**

Run:

```bash
cd app && bun test src/renderer/js/model-menu-state.test.ts src/renderer/js/project-model-settings.test.ts src/renderer/js/model-lock-message.test.ts && bun run typecheck
```

Expected: PASS

- [ ] **Step 6: Manual verification**

1. Open Project settings → Project model shows `project.model`.
2. Change model, click overlay → reopen → original model.
3. Change model, Done → reopen shows new model; active project composer label matches.
4. Lock on → composer disabled; settings picker still works; Done updates composer label while locked.
5. Install/list many models → search appears in settings menu.

- [ ] **Step 7: Commit** (only if user asked)

```bash
git add app/src/renderer/js/projects.ts app/src/renderer/js/app.ts app/src/renderer/js/dropdown.ts app/src/renderer/js/models.ts app/src/renderer/index.html app/src/renderer/styles.css
git commit -m "feat: project settings model picker with Done flush"
```

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Always-visible Project model on General | Task 4 |
| Above Lock model | Task 4 |
| Custom searchable dropdown | Tasks 1, 3, 4 |
| Draft until Done | Task 5 |
| Lock immediate-save unchanged | Task 5 (no change to lock handler) |
| Overlay/Esc discard | Task 5 |
| Sync composer only if active project | Tasks 2, 5 |
| Missing model still shown | Tasks 1, 2 |
| Models refresh keeps draft | Tasks 1, 5 |
| No schema change | (none) |
| Unit tests independent instances / seed / sync | Tasks 1–2 |

## Self-review notes

- No TBD/placeholder steps; commit steps gated on user request.
- `ModelMenuApi` must expose `closeMenu()` for discard — added in Task 5 Step 1.
- Esc handler must not fight dropdown Esc: only dismiss modal when both menus are hidden.
- `saveProjectModel()` (composer onChange) remains; settings Done is a separate write path.
