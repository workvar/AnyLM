# AnyLM UI polish pass

**Date:** 2026-08-05  
**Status:** Approved  
**Approach:** Single coordinated polish pass (sidebar, settings hub, files, ask float, models, visual tokens)  
**Surfaces:** `app/src/renderer/` (HTML/CSS/JS), related main-process IPC for Open-with apps, model delete, file existence, title refresh

## Problem

Ten UI/UX issues from production use of the Electron chat app:

1. Active sidebar chat highlight is an elongated / asymmetric oval, not a uniform pill.
2. After file creation, Open-with does not list real device apps (Preview, Numbers, etc.).
3. Generated-file cards vanish after app restart; they should persist when the file still exists, else show “File missing”.
4. Chat header title is not left-aligned with the message column; auto-generated titles do not update the header/sidebar until the user switches tabs.
5. Sidebar mixes project tree + chats and tags chats by project; project organization should live only in the Projects tab.
6. Six large sidebar nav buttons (Projects, Models, Organization, Tools, Skills, Customize) consume too much space.
7. Models tab does not show all installed Ollama models; no remove action.
8. Grey backgrounds and cards feel dull; restyle toward a WorkVar-inspired quiet, refined look.
9. Clarification ask prompt sits inline in scroll history; it should float pinned above the composer.
10. After answering, transcript shows only “You chose: …”; it should also show the question.

## Decisions (locked)

| Topic | Choice |
|-------|--------|
| Sidebar chats | **A** — Flat Chats only; remove Projects tree from sidebar; Projects only via Projects button → Projects view |
| Open with apps | **A** — Real OS handlers for that file type (Launch Services / associations) |
| Settings destination | **C** — Dedicated Settings main-pane page with left settings nav |
| Visual restyle depth | **B** — Stronger restyle (tokens, type, surfaces, cards); still AnyLM, not WorkVar marketing clone |
| Delivery | Single polish pass |

## Goals

1. Flatten and slim the sidebar; move secondary destinations into a Settings hub.
2. Make generated files durable and openable with real apps on the device.
3. Fix title alignment and live title/summary refresh in header + sidebar.
4. Pin clarification asks above the composer; persist Q+A in the transcript.
5. Show all installed models with remove; refresh visual language across views.

## Non-goals

- Changing document generation paths or permission Allow/Deny flow (already shipped).
- Full OS “Open with…” system dialog beyond listing handlers we can resolve.
- Cloning WorkVar’s editorial marketing layout inside the chat chrome.
- Reworking Organization/Tools/Skills feature logic beyond relocating them under Settings.
- Dark-mode redesign (keep current light theme, refine it).

---

## 1. Sidebar & navigation

### Layout

```
[AnyLM brand]
[+ New chat]
[Search…]
[Projects]          ← only primary destination button kept

── CHATS ──
  · flat recent list (standalone + project threads mixed by recency)
  · no project name / “Chat” meta on the right
  · active row = uniform rounded pill (equal corner radius)

[status]
[user] → Settings opens hub (Customize lives under Settings → Customize)
```

### Removals from sidebar

- Projects tree (`#side-projects`, section label, `#side-new-project`).
- Nav buttons: Models, Organization, Tools, Skills, Customize.
- Per-row project meta in `renderRecents` (today: `it.projectName` / `"Chat"`).

### Active row highlight

- Fix CSS on `.nav-list li.active` (and any left-edge indicator) so the highlight is a **symmetric pill**: consistent `border-radius`, no stretched oval / asymmetric left capsule.
- Keep activity dots working on `data-conv-key` rows.

### Projects entry

- Single `#projects-nav` (or equivalent) opens the existing Projects main view.
- Project chats remain openable from Projects tab and from the flat Chats list (threads still appear as recents by title only).

---

## 2. Settings hub (main pane)

### Structure

New main view `#settings-view` (or reuse/expand main pane pattern):

| Left nav | Content |
|----------|---------|
| General (optional) | Existing app settings currently in `#settings-modal` that still belong here |
| Models | Current models browser (+ installed list + remove) |
| Organization | Current org dashboard |
| Tools | Current tools view |
| Skills | Current skills view |
| Customize | Current customize content |

### Entry points

- User menu: **Settings** opens the hub (default to General or last section).
- Remove the separate **Customize** shortcut from the user popup; Customize is only under Settings → Customize.
- Deep links from old nav IDs redirect into the hub and select the matching section.
- Closing Settings returns to the previous main view (chat / projects) as today when leaving other views.

### Sidebar after change

Only **Projects** remains as a full-width side-nav control above the scroll area (plus New chat / search). Settings is not a sixth fat button; it lives under the user row.

---

## 3. Chat header, titles & ask float

### Title alignment

- `#convo-name` / chat header title left-aligned with the messages column content edge (not optically centered in the remaining header gap).
- Align with composer / message padding; hamburger/back stay to the left of the title without large empty mid-gap.

### Live title / summary update

Today `turns.ts` `commit()` updates `el("convo-name")` when the open chat is active, but does **not** refresh the sidebar recents row.

Required:

1. After `maybeTitle` succeeds and persistence updates, immediately:
   - set header `#convo-name`
   - update in-memory recents / chat title state
   - call `loadRecents()` (or a lighter `paintRecentsTitle(key, title)`) so the sidebar row updates without leaving the tab
2. Same path for project threads and standalone chats.

### Ask card — floating pin

- Move `.ask-card` out of `#messages` scroll flow into a host pinned **just above** the composer (e.g. `#ask-dock` sibling above `#prompt` / input bar).
- While unanswered: dock visible; chat history can scroll underneath.
- On answer / skip / leave conversation: clear dock (`clearAsk`).
- Re-attach on `attachTurn` when returning to a chat with `pendingAsk`.

### Answered transcript

When answering, append a compact transcript block that includes:

- The **question** text
- The outcome: `You chose: {answer}` or `Skipped`

**Persistence (locked):** append a durable chat message artifact, e.g. `{ role: "ask", question, answer }` (or equivalent field the paint path already tolerates), so reload rehydrates the same Q+A block. Do not rely on ephemeral DOM-only nodes.

---

## 4. Generated files — Open with + persistence

### Open with (extends prior file-card design)

Supersedes the prior non-goal of “no full Launch Services listing.”

**Primary button:** Open with default handler (label = default app display name when available, else “Default app”).

**Dropdown:**

1. Default app (same as primary)
2. Each other OS-registered app for that file / UTI / extension (e.g. Preview, Numbers, Excel, Chrome)
3. Preview in AnyLM (project + supported type only)
4. Show in folder

**IPC (new/extended):**

- `pfiles:apps-for` (or similar): given allowlisted `dir` + `name`, return `{ defaultApp, apps: [{ id, name, path? }] }`.
- `pfiles:open-with`: open file with a chosen app id/path (macOS: Launch Services / `open -a`; Windows: association / shell verb as available).
- Reuse existing allowlist checks from `pfiles:open` / `pfiles:show`.

If the OS returns no apps, fall back to Default app + Show in folder (+ Preview when applicable).

### Persistence

File cards are DOM-only today (`onFileGenerated` → `showFileCard`); they disappear on reload.

**Store** on generate (alongside or inside chat/thread record):

```ts
{
  kind: "generated_file",
  name: string,
  ext: string,
  dir: string,      // absolute directory
  createdAt: number
}
```

**Persistence (locked):** Append a message-like artifact in the conversation messages array, e.g. `{ role: "artifact", type: "file", name, ext, dir, createdAt }`, so chronological placement matches when the file was created. `convo` paint recognizes it and rehydrates via `showFileCard` / `renderFileCard`. Do not use a parallel `generatedFiles[]` sidecar.

**On restore:**

1. `existsSync(join(dir, name))` (or IPC `pfiles:exists`).
2. Exists → full card + Open with.
3. Missing → card in **File missing** state: filename shown, actions disabled (or only “path was …”), clear missing label.

First-create path must always show the card after generate (fix any case where Open with failed to appear).

---

## 5. Models (Settings → Models)

### Installed list

- Source of truth: `window.api.listModels()` / Ollama list — **every** installed tag, not intersection with `POPULAR_MODELS` only.
- UI: Installed section (or filter) lists all installed models with size if available.
- Catalog / popular remains for discovery + pull.

### Remove

- Per installed model: **Remove** → confirm → `window.api.deleteModel(name)` (IPC already exists: `models:delete`).
- On success: refresh installed set, dropdown models, and Models view.
- Block remove while that model is the active chat model only if necessary; otherwise allow and fall back selection.

---

## 6. Visual restyle (WorkVar-inspired B)

### Direction

Quiet, garden-like productivity: clarity over chrome. Not purple SaaS, not cream-serif brochure.

### Token changes (CSS variables)

- Backgrounds: replace flat medium grey with softer warm off-white / very light sage-tinted surfaces; slight depth between sidebar, main, rail.
- Surfaces: white/soft cards with restrained border + soft shadow; reduce “grey card on grey slab”.
- Text: clearer hierarchy (title / body / meta); readable expressive font pairing if already feasible without heavy new deps — otherwise refine weights/sizes on current stack.
- Accent: keep forest green; refine primary buttons and user bubbles.
- Spacing: slightly more breathing room on models/settings grids; tighter sidebar nav now that six buttons are gone.

### Scope

Apply across: sidebar, chat, ask dock, file cards, Projects, Settings hub, Models cards, empty states. Shared components in `styles.css` first; avoid one-off page themes.

---

## Architecture / data flow

```
Sidebar: New chat | Search | Projects
         Chats (flat recents)
User → Settings hub → [Models|Org|Tools|Skills|Customize|General]

Generate document → persist file artifact → showFileCard
Reload chat → load artifacts → exists? card : File missing
Open with → IPC apps-for → menu → open-with / open / show / preview

maybeTitle → updateChat/Thread → convo-name + loadRecents

Ask → #ask-dock float → answer → transcript (question + choice) → persist
```

### Key files (expected touch list)

| Area | Files |
|------|--------|
| Sidebar / nav | `index.html`, `nav.ts`, `app.ts`, `recents.ts`, `views.ts`, `sidebar/*`, `styles.css` |
| Settings hub | `index.html`, `settings.ts`, `app.ts`, `models.ts`, `org.ts`, `tools-view.ts`, `skills-view.ts`, `customize.ts` |
| Titles | `turns.ts`, `titler.ts`, `convo.ts`, `recents.ts`, `styles.css` |
| Ask float | `ask-card.ts`, `turns.ts`, `index.html`, `styles.css` |
| File cards | `file-cards.ts`, `chat.ts`, `convo.ts`, history/store, `project-files.ts`, `ipc.ts`, `preload.ts`, `api.d.ts` |
| Models | `models.ts`, ollama IPC |
| Theme | `styles.css`, `theme.ts` if tokens live there |

---

## Error handling

- Apps-for IPC failure → Default app + Show in folder only; no empty broken menu.
- Open-with fails → silent log + optional toast if one exists; do not crash renderer.
- File missing → non-interactive missing state; do not delete the artifact record automatically.
- Model delete failure → keep card, show error inline.
- Title generation failure → leave “New chat”; no sidebar thrash.

---

## Testing

- Active chat pill looks circular/symmetric at typical sidebar widths.
- Sidebar: no Projects tree; no Models/Org/Tools/Skills/Customize buttons; flat chats without project meta.
- Settings hub opens each section; Projects still opens from sidebar.
- Generate PDF/XLSX → Open with lists real apps → open works; Show in folder works.
- Restart app → file card present if file exists; delete file on disk → “File missing”.
- Auto-title appears in header and sidebar without tab switch.
- Ask floats above composer; answer shows question + choice; survives reload if persisted.
- Models Installed shows all Ollama models; Remove deletes and refreshes.
- Visual pass: chat, models, settings no longer dull grey-on-grey; accent preserved.

## Implementation notes

- Prefer incremental commits within one branch matching this spec.
- Prior doc `2026-08-05-doc-permission-file-card-design.md`: Open-with non-goal is superseded for OS app listing; permission row behavior stays.
`)