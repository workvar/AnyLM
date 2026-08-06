# Document permission + finished-file card redesign

**Date:** 2026-08-05  
**Status:** Implemented  
**Surfaces:** `app/src/renderer/js/file-cards.ts`, `app/src/renderer/styles.css`, related IPC/preload for open-with

## Problem

When the model wants to `generate_document` (PDF / DOCX / XLSX / PPTX / MD), the inline permission UI is a tall, inset card (`max-width: ~78%`). After allow, the finished-file card is a click-only inset chip with no explicit “Open with” control. Users need a clearer, full-width permission flow and an Antigravity-style open action after a successful generate.

## Goals

1. Reshape the **permission** prompt into a shorter, **full-width** three-row block (messages-column width; existing chat padding/margins only).
2. **Deny** → collapse the same block and show **“Denied”** (block stays; no file card).
3. **Allow** → remove the permission block; when the file is written, show a **compact full-width finished-file row** with **Open with {default app}** + dropdown (Antigravity pattern, not the screenshot’s taller inset card).
4. Keep other risky-tool confirms on the existing modal.

## Non-goals

- Listing every OS-installed app for a MIME type (full Launch Services / registry picker).
- Redesigning non-document tool confirms.
- Changing document generation / storage paths.

## Permission prompt

### Layout (three rows, one full-width container)

| Row | Content |
|-----|---------|
| 1 | Permission ask — e.g. “Create a file in your folder?” |
| 2 | Short description — format badge + filename + where it writes (project folder vs Documents/AnyLM) |
| 3 | `Deny` · `Allow` |

Drop the current stacked “Permission needed” badge + tool-name header chrome as primary hierarchy (tool id may remain visually quiet if useful for debugging, but must not inflate height).

### Dimensions

- `align-self: stretch` (or equivalent) so width is 100% of the messages column.
- Padding/margins match sibling chat chrome (e.g. ask-card stretch pattern).
- Height: content-driven three rows; no large unused vertical padding.

### Lifecycle

| User action | Result |
|-------------|--------|
| **Deny** | Remove action buttons. Collapse to a compact residual state on the **same** element: visual “Denied” (keep filename context if space allows). Do **not** show a finished-file card. |
| **Allow** | Remove the permission block from the DOM immediately (or as soon as confirm is replied). Wait for `onFileGenerated`, then show the finished-file row. |
| Generation fails after Allow | Permission already gone; surface failure via existing tool/rail error path (no resurrected permission card). |

Track the active permission element (e.g. data attribute / weak map by confirm token) so Allow can remove the correct node if multiple prompts are theoretically present.

## Finished-file card (after Allow + successful generate)

### Layout

Compact **full-width** horizontal row:

- Left: file-type icon
- Center: filename + secondary line (`Document · PDF`, etc.)
- Right: split control — primary **Open with {default app label}**, chevron opens a menu

Height: lesser than the Antigravity reference cards; width: 100% of messages column (same stretch rules as permission).

### Open with behavior

**Primary button** opens the file with the OS default application (`shell.openPath` on the generated path), after the same path-allowlist checks used for `pfiles:show` / generated-file reveal.

**Default app label**

- Prefer a human label when cheaply available (e.g. macOS default handler display name).
- Fallback label: platform-neutral **“Default app”** (or “Preview” / “Excel” only when we already know format → typical app; do not invent wrong brand names).

**Dropdown menu (supported actions)**

Minimum set:

1. Open with default app (same as primary)
2. Preview in AnyLM (when in a project and in-app viewer supports the type — today’s `openFileViewer` path)
3. Show in folder (`pfilesShow` / `showItemInFolder`)

Optional later: “Copy path”. Out of scope: arbitrary third-party app picker UI.

### Formats

Applies to generated document formats: `.pdf`, `.docx`, `.xlsx`, `.pptx`, `.md` (and any other `generate_document` outputs). MD may still offer Preview in AnyLM as primary-adjacent; Open with default remains available.

## Implementation sketch

1. **CSS** — Replace / restyle `.perm-card` for stretch + three-row compact layout; add collapsed `.perm-card.denied` state; restyle `.doc-card.doc-file` for stretch + compact height + action cluster (reuse `.doc-card-actions`).
2. **`showDocConfirm`** — Build three-row DOM; on deny → collapse + “Denied”; on allow → remove node + `replyToolConfirm(true)`.
3. **`showFileCard`** — Build Open-with split button + menu; wire primary/open/preview/reveal.
4. **IPC** — Add `pfiles:open` (or equivalent) that resolves an allowlisted generated path and calls `shell.openPath`. Optionally `pfiles:default-app` for label; ship with “Default app” fallback if label IPC is deferred.
5. **`chat.ts`** — Keep `onToolConfirm` / `onFileGenerated` wiring; ensure allow path does not leave a stale permission node when the file card appears.

## Testing

- Request a PDF in a project → permission full-width three rows → Deny → collapsed “Denied”, no file card.
- Same → Allow → permission gone → file row appears → Open with opens OS default; dropdown Preview / Show in folder work.
- Standalone chat (no project) → description says Documents/AnyLM; Preview in AnyLM hidden or disabled; Show in folder + Open with work.
- XLSX / DOCX / PPTX / MD smoke the same permission → allow → open path.
- Messages column resize: both blocks remain full width within padding.

## Self-review checklist

- [x] No placeholder TODOs in the approved UX
- [x] Deny stays collapsed (does not vanish)
- [x] Allow removes permission; Open with is on the finished-file row only
- [x] Full-width + lesser height called out for both surfaces
- [x] Scope excludes full OS app-picker and non-document confirms
