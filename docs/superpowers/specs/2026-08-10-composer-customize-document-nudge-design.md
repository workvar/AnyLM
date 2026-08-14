# Composer polish, Customize wizard, document soft nudge

**Date:** 2026-08-10  
**Status:** Approved (design)  
**Approach:** Bigger redesign (approach 2) — composer restyle + Customize multi-step wizard + document research soft nudge (option B)  
**Surfaces:**
- `app/src/renderer/styles.css`, `index.html`, `js/views.ts` / activity row layout, `js/customize.ts`, composer toolbar markup
- `app/src/main/ipc.ts` (single-agent tool loop), optionally shared helper under `app/src/main/documents/`
- Tests: customize wizard behavior, document-nudge injection timing

## Problem

From production screenshots (2026-08-10):

1. **Sidebar activity dot** sits almost on the chat title (`position: absolute; left: 2px` overlay).
2. **Composer toolbar** controls (`+`, Tools, folder, workspace chip, Send) have mismatched heights and low-contrast Tools-on styling.
3. **Customize** page textareas are unstyled → tiny light native boxes that overlap labels; one long scroll feels confusing.
4. **Document / PDF requests** can burn many of the 15 tool rounds on repeated `web_search` / `http_fetch` (including the same URL twice) without calling `generate_document`, so the UI looks “stuck in a loop.”

Related prior work: [document research + content quality](2026-08-08-document-research-quality-design.md) correctly pushes research-then-write; this spec adds a **soft mid-loop nudge** so research does not run forever on small models.

## Decisions (locked)

| Topic | Choice |
|-------|--------|
| Overall approach | **2** — composer restyle + Customize wizard (not CSS-only surgical) |
| Document loop | **B** — soft system nudge after research-only rounds; model still decides |
| Sidebar dot | Always reserve gutter (not only when working) |
| Composer control height | **32px** shared |
| Customize structure | **3-step** wizard; master “Use my context” toggle always visible |
| Autosave | Keep existing debounce autosave; wizard is navigation, not a save gate |
| Max tool rounds | Keep **15**; do not force `generate_document` or early-exit |
| Duplicate fetches | Soft hint in tool result / nudge text; no hard block |

## Goals

1. Readable sidebar titles with clear gap between activity dot and text.
2. One aligned composer control row with readable Tools on/off states.
3. Customize feels like a calm guided flow; fields never collapse or overlap.
4. Document-intent chats that only research get one clear nudge toward `generate_document` after limited research, without changing non-document chats.

## Non-goals

- Forcing `generate_document` or cutting the tool loop early.
- Changing thin-content reject rules or PDF CSS from the 2026-08-08 design.
- Redesigning Projects / Artifacts / Settings nav chrome beyond Customize panel body.
- Changing OAuth / Firebase sign-in (separate fix).
- Guaranteeing every model produces a PDF on first try.

---

## 1. Sidebar activity dot

### Current

`.nav-list li > .conv-dot` is absolutely positioned at `left: 2px` so idle (transparent) dots do not indent titles. When `.is-working` / `.is-waiting`, the colored dot crowds the title.

### Target

- Row remains flex; drop absolute overlay for the dot.
- Reserve a fixed **12px** width for `.conv-dot` (idle stays transparent).
- **8px** gap between dot column and `.conv-title`.
- Keep pulse / waiting colors and reduced-motion rules.

### Acceptance

- Working chat: visible gap between green/amber dot and first glyph of title.
- Idle chats: titles stay left-aligned with each other (gutter always present).

---

## 2. Composer toolbar

### Target layout

Single row, `align-items: center`, **8px** gap:

`[+ attach] [Tools] [📁 workspace] [workspace chip?] … [model] [Send]`

### Shared metrics

| Property | Value |
|----------|--------|
| Control height | **32px** |
| Corner radius | **10px** |
| Horizontal gap | **8px** |

Applies to: `#attach-btn`, `#tools-toggle`, `#workspace-btn`, `#workspace-label.chip`, `.composer-model .dropdown-trigger`, `#send-btn`.

### Tools states

| State | Appearance |
|-------|------------|
| Off | Quiet outline / panel fill; muted icon + label |
| On | Accent fill; **high-contrast** icon + label (not muted-on-green) |

### Workspace chip

- Same 32px height; max-width + ellipsis; full path in `title` tooltip.
- Must not push Send off-screen on narrow panes (flex shrink / truncate).

### Acceptance

- All named controls share one baseline height in light and dark themes.
- Tools-on label remains readable on accent.

---

## 3. Customize wizard

### Structure

Always-visible header inside Customize panel:

1. Short intro copy (existing meaning: context applied to every chat).
2. **Use my context** toggle (existing `uc-enabled`).

Then a **3-step** wizard (one step visible):

| Step | Title | Fields |
|------|--------|--------|
| 1 | Who you are | Name (`uc-name`), About you (`uc-about`) |
| 2 | What you work on | Work (`uc-work`) |
| 3 | How to reply | Style (`uc-style`), Anything else (`uc-extra`) |

### Chrome

- Step indicator: `1 — 2 — 3` (current emphasized; completed optional check; future muted).
- Nav: **Back** (disabled on step 1), **Next** (steps 1–2), **Done** on step 3. **Done does not close Settings**; it stays on step 3 and may briefly emphasize the step indicator as complete. Closing Customize is still via normal Settings navigation.
- Empty steps allowed; wizard is guidance only.
- All inputs full-width, dark-theme tokens (`auth-input`-equivalent); textareas `min-height: ~96px`; stacked label → control with consistent vertical rhythm.
- Autosave on input unchanged (`customize.ts` debounce); show **Saved** in footer.

### Markup / CSS

- Fix root cause: unstyled `#uc-about` / `#uc-work` / `#uc-style` / `#uc-extra` textareas.
- Prefer explicit field wrappers (`.customize-field`) and step panels (`.customize-step`) so layout cannot inline-collapse.

### Acceptance

- No overlapping labels/inputs; no native white mini-textareas on dark theme.
- User can move Back/Next across all fields; values persist across steps and reloads via existing storage.

---

## 4. Document research soft nudge

### When

In the single-agent tool loop (`ipc.ts`), when:

1. Document intent was detected for this turn (`documents/intent.detect` on the latest user message), and
2. At least **2** completed tool rounds contained only research tools (exact names: `web_search`, `http_fetch`), and
3. **No** `generate_document` call attempted yet this turn (in any round), and
4. The soft nudge has **not** already been injected this turn,

then append **one** system message before the next model call:

> You already ran research tools. Prefer calling `generate_document` now with full markdown. Only search/fetch again if a critical fact is still missing.

### Rules

- Model still decides (option B); do not auto-invoke `generate_document`.
- Keep max rounds at **15**.
- Non-document turns: no nudge.
- Extract a pure helper (e.g. `shouldNudgeDocumentGenerate(state)`) under `app/src/main/documents/`.
- Wire it in **`ipc.ts`** (required) and in **`agents/workers.ts`** document/tool rounds (required: document allowlist includes `web_search` / `http_fetch` / `generate_document`).

### Duplicate URL hint (optional, light)

If `http_fetch` is called for a URL already fetched this turn, return a short note in the tool result that the page was already retrieved — still allow the call; do not hard-error.

### Acceptance

- Repro: “create a PDF on how to publish RN Android app” with tools on → after two research-only rounds, next model input includes the nudge once.
- Model may still research once more; loop does not force generation.
- Q&A / non-PDF chats unchanged.

### Tests

- Unit: helper decides when to inject (0/1/2 research rounds; after `generate_document`; second nudge suppressed).
- Optional: ipc-level or pure function test with fake round history.

---

## Out of scope / follow-ups

- Hard research caps or mandatory generate after N rounds (rejected; was approach A).
- Composer layout redesign beyond the toolbar row (e.g. moving chips above the form) — only if chip overflow still fails acceptance.
- Visual companion mockups — not required once sections were approved from screenshots.

## Implementation order (for plan)

1. Sidebar gutter CSS (+ any class tweaks in `views.ts` / activity).
2. Composer shared-height CSS + Tools contrast.
3. Customize HTML structure + CSS + `customize.ts` step state.
4. Document nudge helper + `ipc.ts` wiring + tests; worker hook if trivial.

## Success criteria

| Area | Pass |
|------|------|
| Sidebar | Dot–title gap clearly ≥ ~8px when working |
| Composer | One visual height for listed controls; Tools-on readable |
| Customize | Wizard usable; fields themed and non-overlapping |
| PDF loop | Soft nudge fires once after 2 research-only rounds on document intent |
| Regression | Email/password auth, non-tool chat, thin-content reject unchanged |
