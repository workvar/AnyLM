# Project settings model picker

**Date:** 2026-08-08  
**Status:** Approved (design)  
**Approach:** Shared custom searchable dropdown + flush model on Done (approach 2)  
**Surfaces:** `app/src/renderer/index.html` (`#project-modal` General), `app/src/renderer/js/dropdown.ts` (multi-instance), `app/src/renderer/js/projects.ts`, `app/src/renderer/js/app.ts`

## Problem

Project settings General has **Lock model to this project** with copy “Use only this model here; disables the picker,” but there is no control to choose which model. Projects already store `model` and `modelLocked`; the model is only changed via the composer header picker. Once locked, that picker is disabled, so settings never surfaces the locked model.

## Decisions (locked)

| Topic | Choice |
|-------|--------|
| Picker visibility | Always show a Project model control on General (not only when lock is on) |
| Control type | Custom searchable dropdown matching the composer picker (not native `<select>`) |
| Persistence timing | Draft in modal; persist `project.model` on **Done** |
| Lock toggle | Unchanged: immediate save on change |
| Dismiss / overlay / Esc | Discard draft; no model write |
| Schema | No change — reuse `Project.model` + `modelLocked` |
| Composer sync on Done | Only if this project is the active open project |

## Goals

1. Users can see and choose the project’s model inside Project settings.
2. Lock means “freeze the composer picker to this project’s model,” not “mystery model.”
3. Settings picker matches composer UX (search when many models, checkmarks, keyboard).
4. Accidental model changes are discarded if the modal is dismissed without Done.

## Non-goals

- Changing lock popover copy or chat-started lock rules.
- Making the lock toggle itself Done-flushed.
- Redesigning other project settings tabs.
- Native `<select>` for this field.

---

## 1. UI & behavior

**General tab order:** Project name → Instructions → **Project model** (new) → Lock model → Storage folder → Auto-log

**Project model control**

- Always-visible custom searchable dropdown (same visual language as `#model-dropdown`: trigger, checkmarks, search when more than 5 models).
- Prefills from `project.model` (fallback: first installed model).
- Enabled whether lock is on or off — this is where the locked model is chosen.
- Changing selection only updates a **draft** while the modal is open.

**Lock toggle**

- Existing copy and immediate `modelLocked` persistence.
- When on: composer picker disabled; uses this project’s model.

**Done**

1. Persist draft via `updateProject({ model })`.
2. If this project is the active one: sync composer picker to that model, then `updateModelLock()`.
3. Close modal.

**Cancel / overlay dismiss / Esc**

- Discard draft; no model write.

---

## 2. Wiring

Extract a reusable model-menu helper from the composer dropdown (search, keyboard, checkmarks) so composer and Project settings share one implementation, each with its own DOM root (`#model-dropdown` vs `#project-model-dropdown`).

| Piece | Change |
|-------|--------|
| `index.html` | Add Project model field + dropdown markup above the lock row |
| `dropdown.ts` (or small shared module) | Factory / multi-instance support; keep existing composer API (`getSelectedModel`, `setModelDropdown`, `setModelDropdownEnabled`, …) |
| `projects.ts` | On open: seed settings picker from `project.model`. Track draft. On Done flush: `updateProject({ model })`, sync composer if active project |
| `app.ts` | Done handler flushes model before close; lock `onchange` stays immediate |
| Types / main | No schema change |

Suggested markup ids (illustrative): `#project-model-dropdown`, `#project-model-trigger`, `#project-model-current`, `#project-model-menu`, `#project-model-search`, `#project-model-options`.

---

## 3. Edge cases

| Case | Behavior |
|------|----------|
| No models installed | Trigger shows “No models”; menu empty / non-openable |
| `project.model` missing from installed list | Still show it as selected; keep in list until user picks another |
| Models list refreshes while modal open | Repopulate options; keep draft selection if still present |
| Overlay click / Esc close | Discard draft (same as cancel) |
| Lock on, model changed in settings, Done | Persist model; composer stays disabled but label updates to new model |
| Standalone chat / other project open | Done still saves this project’s model; do not overwrite composer selection |

---

## 4. Testing

- Unit: multi-instance dropdown (select / search / independent state).
- Unit or focused renderer test: open settings seeds from `project.model`; Done persists draft; dismiss discards.
- Sync: Done updates composer only when that project is active; lock still disables composer picker.

Manual:

1. Open Project settings → Project model shows current project model.
2. Change model, dismiss without Done → reopen → original model.
3. Change model, Done → reopen shows new model; if project active, composer label matches.
4. Lock on → composer picker disabled with existing popover; settings picker still usable.
5. Many models → search field appears in settings menu.

---

## Success criteria

1. General tab always shows a searchable project model picker above Lock model.
2. Done persists `project.model`; dismiss does not.
3. Lock continues to disable only the composer picker.
4. Active project’s composer label stays in sync after Done.
