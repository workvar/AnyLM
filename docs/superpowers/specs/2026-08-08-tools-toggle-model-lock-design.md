# Tools toggle label, persistence, and model-lock affordance

**Date:** 2026-08-08  
**Status:** Approved  
**Approach:** Preference flags + bulk patch (project default + settings default for new general chats)  
**Surfaces:** composer tools toggle, model dropdown, general-chat choice modal; project/thread/chat persistence; app settings

## Problem

1. The composer tools control is icon-only (⚒), so users often do not know what it does.
2. After a conversation has started, the model picker is already non-changeable, but it still looks clickable and has no explanation on hover.
3. Tools on/off is stored only per chat/thread (`useTools`). Enabling tools in one project thread does not stick when switching to another thread in the same project.
4. For standalone (non-project) chats, users need a way to opt into a default for **new** general chats without silently rewriting existing ones.

## Decisions (locked)

| Topic | Choice |
|-------|--------|
| Persistence approach | Preference flags + bulk patch |
| Project tools on | Project-wide: **existing + new** threads all get `useTools: true` |
| Project tools off | Clear project default; **all threads in that project** get `useTools: false` (does not affect general chats) |
| General “all” scope | Default for **new** general chats only (existing unchanged) |
| General enable prompt | Ask **every time** tools are turned on in a general chat |
| General disable when default on | Ask: clear default for new general chats vs only this chat |
| Tools toggle label | Icon + visible text **“Tools”** |
| Model lock UX | Disabled button + hover/focus popover explaining why |

## Goals

1. Make the tools control self-explanatory in the composer.
2. Make a locked model picker look and behave disabled, with a clear hover message.
3. Remember tools-on across chats in the same project (existing + new).
4. Let users choose a lasting default for new non-project chats without mutating existing general chats.
5. Keep project and general scopes strictly separate.

## Non-goals

- Changing which tools are available or how tool execution / confirmations work.
- Per-tool enablement in the composer (still managed on the Tools page).
- Letting users change model after the first message.
- Applying the general-chat “all new” default to existing standalone chats.
- Settings UI to manage `defaultUseToolsForChats` beyond the composer prompts (can be added later).

---

## 1. Tools persistence

### Data model

| Location | Field | Meaning |
|----------|-------|---------|
| `Project` | `defaultUseTools?: boolean` | Project-wide tools default. When true, threads should have tools on; when false/absent, off. |
| `AppSettings` | `defaultUseToolsForChats: boolean` | Default for **newly created** standalone chats. Default `false`. |
| `ProjectThread` / `StandaloneChat` | `useTools?: boolean` | Per-conversation flag already used by the send path (unchanged meaning). |

### Project chats

**Turn on** (any thread in the project):

1. Set `project.defaultUseTools = true`.
2. Set current thread `useTools = true`.
3. Patch **all** threads in that project to `useTools: true`.
4. Update the toggle UI to active.
5. No confirm dialog.

**Turn off** (any thread in the project):

1. Set `project.defaultUseTools = false`.
2. Set current thread `useTools = false`.
3. Patch **all** threads in that project to `useTools: false`.
4. Update the toggle UI to inactive.
5. No confirm dialog. Does not change general chats or `defaultUseToolsForChats`.

**New thread:** seed `useTools` from `project.defaultUseTools` (truthy → true).

**Open thread:** load `thread.useTools` into the toggle (existing behavior). After a project-wide on/off, every thread’s stored flag already matches.

Prefer a **main-process helper** (e.g. IPC that sets `defaultUseTools` and updates all thread `useTools` in one write) so the bulk update stays consistent with how projects are stored on disk.

### General (non-project) chats

**Turn on:**

Always show a two-choice modal (even if `defaultUseToolsForChats` is already true):

- **All new non-project chats** → set `defaultUseToolsForChats = true`, set this chat `useTools = true`.
- **Only this chat** → set this chat `useTools = true` only; leave the setting unchanged.
- **Cancel** → leave tools off; no persistence change.

**Turn off when `defaultUseToolsForChats` is true:**

Show a two-choice modal:

- **All new non-project chats** → set `defaultUseToolsForChats = false`, set this chat `useTools = false`.
- **Only this chat** → set this chat `useTools = false` only; leave the setting true.
- **Cancel** → leave tools on.

**Turn off when `defaultUseToolsForChats` is false:**

Just set this chat `useTools = false` (no dialog).

**New standalone chat:** seed `useTools` from `defaultUseToolsForChats`.

**Open chat:** load `chat.useTools` into the toggle (existing behavior). Existing chats are never rewritten by the “all new” choice.

### Web-research / other auto-enable paths

Paths that call `setUseTools(true)` without a user click (e.g. web-research hint) should:

- Persist `useTools` on the **current** conversation only.
- **Not** set project `defaultUseTools` or `defaultUseToolsForChats`.
- **Not** show the general-chat scope modal.

Composer toggle clicks are the only entry that triggers scope prompts / project-wide defaults.

---

## 2. UI

### Tools toggle

- Keep the ⚒ icon; add a visible **“Tools”** label beside it in the composer toolbar (`#tools-toggle` or a small wrap that includes icon + label).
- Active styling continues via `.tools-toggle.active` (applies to the whole control including the label).
- Accessible name / title: **“Enable tools”** when off, **“Tools enabled”** when on.

### Model chooser when locked

Existing lock rules in `updateModelLock()` stay:

- Disabled when the conversation has any messages (`state.chat.length > 0`).
- Disabled when the project has `modelLocked`.

When disabled:

- Not clickable (`setModelDropdownEnabled(false)` — already blocks open).
- Visual disabled state (existing `.dropdown-trigger.disabled`).
- Hover **and** keyboard focus show a lightweight custom popover (not native `title` alone). Message priority:
  1. If the conversation has started (`state.chat.length > 0`): **“Models cannot be changed after conversation has started.”** (wins even if the project also locks the model)
  2. Else if project `modelLocked`: **“Model is locked for this project.”**

### Choice modal (general chats)

Reuse the existing modal family (`prompt-modal` style): overlay + small panel.

**Enable:**

- Title: Keep tools enabled for…?
- Actions: **All new non-project chats** · **Only this chat** · Cancel

**Disable (when global default on):**

- Title: Turn tools off for…?
- Actions: **All new non-project chats** · **Only this chat** · Cancel  
  (“All new…” here means clear the default for future general chats.)

---

## 3. Wiring

### Renderer

| File | Role |
|------|------|
| `tools-toggle.ts` | Orchestrate enable/disable (project bulk vs general dialogs); keep `getUseTools` / `setUseTools` for UI sync. Add a distinct path for “user clicked toggle” vs silent persist. |
| `tools-scope-prompt.ts` (new) or extend `prompt.ts` | Async two-choice (+ cancel) modal. |
| `chats.ts` | On create, seed `useTools` from settings; on select, apply stored flag. |
| `threads.ts` | On create, seed from `project.defaultUseTools`; on open, apply stored flag. |
| `convo.ts` / `dropdown.ts` | Expose lock reason; show disabled popover on hover/focus. |
| `chat.ts` | Toggle click → scope-aware handler (not raw `setUseTools(!…)`). |
| `index.html` + `styles.css` | Label, tooltip, choice modal markup/styles. |
| `web-research-hint.ts` | Keep current-chat-only enable (no scope prompts). |

### Main / types

| File | Role |
|------|------|
| `domain.d.ts` | `Project.defaultUseTools`, `AppSettings.defaultUseToolsForChats`. |
| `settings.ts` | Default `defaultUseToolsForChats: false`. |
| Project store + IPC | Helper to set `defaultUseTools` and patch all thread `useTools` in one operation. |
| `api.d.ts` / `preload.ts` | Expose the helper if added. |

### Tests

- New chat seeds `useTools` from `defaultUseToolsForChats`.
- New project thread seeds from `project.defaultUseTools`.
- Project on → all threads `useTools: true` + `defaultUseTools: true`.
- Project off → all threads `useTools: false` + `defaultUseTools: false`.
- General enable/disable choice outcomes (setting + current chat).
- Auto-enable paths do not set defaults.
- Model-lock popover message selection (started vs project-locked).

---

## 4. Error handling

- If project bulk patch fails mid-way, surface a short error and leave the toggle reflecting the last successfully loaded conversation state on next open (prefer main-side atomic write to avoid partial updates).
- If the user dismisses the choice modal (Cancel / overlay), do not flip the toggle.
- Missing/legacy projects and chats without the new fields treat defaults as false / unset.

---

## 5. Out of scope follow-ups

- Settings screen control for “Tools on for new general chats”.
- Project settings toggle mirroring `defaultUseTools`.
- Remembering “don’t ask again” for the general enable prompt.
