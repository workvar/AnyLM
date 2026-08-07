# Project settings tabbed layout

**Date:** 2026-08-07  
**Status:** Approved  
**Approach:** 3 tabs — General · Memory sharing · Context  
**Surfaces:** `app/src/renderer/index.html` (`#project-modal`), `app/src/renderer/styles.css`, `app/src/renderer/js/projects.ts` (open + tab switching)

## Problem

The project settings modal opens as one long vertical stack (name, instructions, three toggles, storage folder, knowledge flow, context references). After creating a project it feels crowded and hard to scan. Users need clearer grouping without changing what the settings do.

## Decisions (locked)

| Topic | Choice |
|-------|--------|
| Tab count | **3** — General, Memory sharing, Context |
| Memory sharing contents | Knowledge-only: Share with organization + Knowledge flow |
| Storage + auto-log | On **General** (separate from memory sharing) |
| Context tab | Context references list (+ Add) |
| Default tab | **General** (including when opened after new-project create) |
| Tab UI pattern | Existing segmented control (`.seg` / `.tabs`) used elsewhere |
| Behavior | Layout-only; keep existing element IDs and save handlers |

## Goals

1. Reduce visual density by showing one coherent group of settings at a time.
2. Make “memory sharing” vs project basics vs reference docs obvious from tab labels.
3. Preserve all current settings and persistence behavior.
4. Match existing AnyLM modal + segmented-control visuals.

## Non-goals

- Changing what any setting does or how it is saved.
- Wizard / multi-step “finish setup” flow after project create.
- Moving settings out of the modal into the project detail view.
- Redesigning other modals (new project, policy, skill, tool).

---

## 1. Tab contents

### General

- Project name
- Instructions
- Lock model to this project
- Storage folder (path + Change / Show)
- Auto-log exchanges to folder

### Memory sharing

- Share knowledge with organization
- Knowledge flow (Isolated / Import only / Export only / Open)

### Context

- Context references header (+ Add)
- Context list

---

## 2. UI structure

```
#project-modal .modal
  h2 Project settings
  p.modal-sub   (updated copy — see below)
  nav.seg#project-settings-tabs
    button[data-tab=general].active  General
    button[data-tab=memory]          Memory sharing
    button[data-tab=context]         Context
  .project-settings-panels
    #ps-panel-general   (default visible)
    #ps-panel-memory    .hidden
    #ps-panel-context   .hidden
  .modal-foot
    #project-modal-close Done
```

- Header and **Done** stay outside panels (always visible).
- Only one panel visible at a time; inactive panels use `.hidden`.
- Subtitle: `Name, memory, and context for this project.`
- Modal may need a modest width bump (e.g. ~480px) so “Memory sharing” fits the segment without wrapping; prefer matching other modals if already wide enough.

### Tab switching

- Small handler in `projects.ts` (or adjacent renderer JS): on `#project-settings-tabs` click, set `.active` on the button, show matching panel, hide others.
- `openProjectSettings()` resets to **General** each open so users land on basics after create / Manage.

---

## 3. Implementation notes

| File | Change |
|------|--------|
| `index.html` | Wrap fields into three panels; add tab bar |
| `styles.css` | Panel spacing inside `#project-modal`; tab bar margin; optional modal width |
| `projects.ts` | Tab click wiring; reset active tab on open |

Do **not** rename existing control IDs (`project-name-input`, `instructions`, `model-lock`, `org-share`, `auto-log`, `project-location`, `kflow`, `add-context`, `context-list`, etc.) so existing listeners keep working.

---

## 4. Testing

Manual:

1. Create a new project → settings opens on **General**.
2. Switch to **Memory sharing** and **Context**; only that panel’s content shows.
3. Edit name / instructions / toggles / flow / add a context file; close with Done; reopen and confirm values persisted.
4. Storage Change / Show still work from General.
5. Manage from project detail still opens the same modal on General.
