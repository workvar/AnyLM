# Artifacts explorer, standalone document generation, and activity status fix

**Date:** 2026-08-08  
**Status:** Approved design  
**Surfaces:** `app/src/main/tools/exec.ts`, `app/src/main/documents/dest.ts`, `app/src/main/project-files.ts`, `app/src/main/ipc.ts`, `app/preload.ts`, `app/src/renderer/js/projects.ts`, `app/src/renderer/js/artifacts.ts` (new), `app/src/renderer/js/activity-store.ts`, `app/src/renderer/js/activity-trail.ts`, `app/src/renderer/index.html`, related types/tests

## Problem

1. `generate_document` hard-fails without a `projectId`, so standalone chats cannot create PDF/DOCX/XLSX/PPTX/MD even though destination logic already supports a fallback folder. Users must retry after moving into a project.
2. There is no sidebar place to browse all generated artifacts across standalone and project scopes, or to delete them from disk.
3. New-project / project-settings location fields are `readonly` (browse-only). Auto folder paths keep spaces from the display name instead of hyphenating. Display name and folder path are forced to stay coupled.
4. During a live turn, Thought / Reasoning / Writing reply can all appear active at once: thinking is not ended when reasoning starts, status rows accumulate, and every status row is painted live while the turn is open.

## Goals

1. Allow document generation in standalone chats into `~/Documents/AnyLM/generated/`.
2. Add a flat **Artifacts** sidebar nav (under Projects) that opens an explorer pane listing `Generated` plus per-project folders; drill-in, open, reveal, and delete.
3. Allow project display names with spaces; auto-derived folder segments use lowercase kebab (`My Project` → `my-project`). Location inputs are keyboard-editable; typed path is independent of the display name.
4. Fix activity trail so only the current phase is live; end thinking when reasoning begins; supersede prior ephemeral status lines.

## Non-goals

- Full file-manager features (rename, move, multi-select, drag-drop).
- Writing into the real app install directory (not writable on macOS packaged apps).
- Redesigning the post-turn collapsed activity summary.
- Indexing/registry DB beyond scanning known folders on disk.
- Hierarchy nested under the Projects/Artifacts nav buttons themselves.

## Approach

Extend existing document destination + project-files patterns (Approach 1). No separate artifacts registry service.

---

## 1. Document generation & storage

### Standalone chats

- Remove the `projectId` required check in `generate_document` (`tools/exec.ts`).
- Pass `projectId: null` through to `documents.generate`.
- Standalone output directory: `path.join(app.getPath("documents"), "AnyLM", "generated")`.
- Create the directory on first write if missing (`dest.reserve` / `fallbackDir`).
- Success tool message must not say “project folder”; e.g. ready / path wording suitable for both scopes.

### Project chats

- Unchanged: write into the project’s configured `folderPath`.

### Permission / file cards

- Standalone destination copy: writes to `Documents/AnyLM/generated` (replace older “Documents/AnyLM” / Documents subfolder wording where it refers to this fallback).

---

## 2. Artifacts explorer

### Sidebar chrome

- One flat **Artifacts** button directly under **Projects** (same `side-nav` pattern).
- No folder hierarchy in the nav strip.

### Explorer pane

When Artifacts is selected, the side-scroll / list region shows the explorer (chats list is not shown in that mode; same pattern as switching to Projects focus).

**Root view**

- `Generated` → `~/Documents/AnyLM/generated`
- One entry per project that has a storage folder; label = project **display name**

**Folder view**

- List files (`.pdf`, `.docx`, `.xlsx`, `.pptx`, `.md`), newest first; skip dotfiles
- Back control returns to root

**File actions**

| Action | Behavior |
|--------|----------|
| Click file | Open with OS default app |
| Right-click → Show in folder | Reveal in Finder / File Explorer |
| Right-click → Delete | Confirm, then delete file from disk and refresh list |

**Refresh**

- On opening Artifacts
- When a document is generated (IPC / existing file-generated signal)

### Main process safety

- List / open / reveal / delete only accept paths under allowed roots: the generated folder and known project `folderPath`s (resolve + prefix check; no traversal).

---

## 3. Project name & location

### Slug

- Shared `safeName` / folder-segment helper: strip illegal path chars, replace whitespace with `-`, collapse repeats, trim, lowercase, max length ~80, fallback `project`.
- Auto-created paths never use spaces in the folder segment.
- Do not migrate or rename existing project folders on disk; slug rules apply to newly auto-derived paths only.

### Editable location

- `#np-location` and `#project-location` lose `readonly`.
- Keyboard type/paste allowed; Browse still sets the field from a folder picker.
- On create/save: persist the path string as-is (mkdir if needed). Do not force rename to match display name.
- Create dialog: name input updates suggested `base/slug(name)` until the user manually edits the location field; after that, name changes do not overwrite location.

### IPC

- Ensure set-location accepts an arbitrary absolute directory path from the typed field (not only picker results).

---

## 4. Activity status transitions

### Main (`ipc.ts` stream handler)

- On first `piece.thinking` (Reasoning…): call `endThinking()` before/with the status event (same as content → Writing reply).
- Stop the thinking ticker so “Thought for Xs” settles when reasoning starts.

### Store / trail

- `applyActivity`: new ephemeral `status` events **supersede** the previous status event (replace in place) so Reasoning… does not remain alongside Writing reply….
- `paintTrail`: only the current live phase gets the running bullet:
  - Thinking `phase: "start"` → live while open
  - Thinking `phase: "end"` → settled label, not live
  - Status → live only if it is the latest status and the turn is still open
- Working strip already prefers latest status; ensure thinking ticker clears when reasoning begins.

### Out of scope

- Collapsed post-turn summary redesign.

---

## 5. Components & data flow

```
Standalone generate_document
  → exec (allow null projectId)
  → documents.generate
  → dest.reserve(null) → Documents/AnyLM/generated/<file>
  → onFile / UI card
  → artifacts list refresh

Project generate_document
  → dest.reserve(projectId) → project.folderPath/<file>

Artifacts UI
  → ipc list roots + files
  → open / reveal / delete (path gated)
```

### New / touched modules (expected)

| Area | Change |
|------|--------|
| `tools/exec.ts` | Allow null projectId; message copy |
| `documents/dest.ts` | `generated` fallback dir |
| `project-files.ts` | kebab `safeName`; artifact list/delete helpers as needed |
| `ipc.ts` / `preload.ts` | Artifacts APIs; typed set-location; end thinking on reasoning |
| `artifacts.ts` + HTML/CSS | Nav button + explorer pane |
| `projects.ts` + HTML | Editable locations; manual-edit latch |
| `activity-store.ts` / `activity-trail.ts` | Status supersede + live paint |
| `file-cards.ts` | Standalone destination string |

---

## 6. Testing

- `dest.fallbackDir` / reserve without projectId → `…/AnyLM/generated`
- kebab slug: `"My Project"` → `my-project`; illegal chars scrubbed
- `generate_document` with null projectId succeeds (unit/mock)
- `applyActivity` status supersede; thinking end replaces start
- Trail paint: only latest status live; ended thought not live
- Path gate rejects paths outside allowed roots (delete/open)

## 7. Error handling

- Cannot create generated/project dir → tool returns clear Error string (existing pattern).
- Delete missing file → soft fail + refresh.
- Invalid typed project path → surface error on save; do not corrupt `folderPath`.
