# Composer Polish, Customize Wizard & Document Soft Nudge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix sidebar activity-dot crowding, unify composer control heights with readable Tools-on contrast, rebuild Customize as a 3-step wizard with themed fields, and soft-nudge document-intent turns toward `generate_document` after two research-only tool rounds.

**Architecture:** Renderer CSS/HTML fixes for sidebar + composer; Customize gains step panels and thin JS navigation while keeping debounce autosave. Main process adds a pure `shouldNudgeDocumentGenerate` helper under `documents/`, wired into the single-agent loop in `ipc.ts` and the tool worker loop in `agents/workers.ts`. Optional light duplicate-URL note on `http_fetch` without blocking.

**Tech Stack:** Electron renderer (vanilla TS/HTML/CSS), Electron main TypeScript, Bun tests (`bun:test`).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-10-composer-customize-document-nudge-design.md`
- Composer control height: **32px**; radius **10px**; toolbar gap **8px**
- Sidebar: always reserve **12px** dot column + **8px** gap to title (no absolute overlay)
- Customize: **3 steps**; “Use my context” always visible; **Done** does not close Settings
- Document nudge: after **2** research-only rounds (`web_search`, `http_fetch`); once per turn; model still decides; max rounds stay **15**
- Do not change thin-content reject or PDF CSS from 2026-08-08
- Commit steps run only when the user explicitly asks to commit (user rule); otherwise skip commits and leave changes unstaged
- Paths below are relative to the repo root unless noted

## File map

| File | Responsibility |
|------|----------------|
| `app/src/renderer/styles.css` | Sidebar gutter, composer shared height, Tools contrast, Customize wizard layout/field chrome |
| `app/src/renderer/index.html` | Customize step markup; optional composer class hooks |
| `app/src/renderer/js/customize.ts` | Step navigation + existing autosave; paint step UI |
| `app/src/renderer/js/customize-wizard.test.ts` | Pure step-index helpers if extracted; or DOM-free step math |
| `app/src/renderer/js/workspace.ts` | Ensure chip `title` is full path (already); rely on CSS truncate |
| `app/src/main/documents/doc-nudge.ts` | Pure nudge decision + constant message text |
| `app/src/main/documents/doc-nudge.test.ts` | Unit tests for nudge timing |
| `app/src/main/ipc.ts` | Track research rounds / generate attempts; inject system nudge |
| `app/src/main/agents/workers.ts` | Same nudge in tool worker mini-loop |
| `app/src/main/tools/exec.ts` (or http helper) | Optional: soft note when URL already fetched this turn |

---

### Task 1: Sidebar activity-dot gutter

**Files:**
- Modify: `app/src/renderer/styles.css` (`.nav-list li`, `.nav-list li > .conv-dot`, `.conv-dot` near ~258–277 and ~4055–4087)

**Interfaces:**
- Consumes: existing `.conv-dot` / `.is-working` / `.is-waiting` classes from `views.ts` + `activity.ts`
- Produces: flex gutter layout (no new JS API)

- [ ] **Step 1: Remove absolute overlay on `.nav-list li > .conv-dot`**

Replace the absolute-position block with a reserved flex column:

```css
.nav-list li {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  height: 36px;
  /* …keep existing border-radius, cursor, etc. */
}

.nav-list li > .conv-dot {
  position: static;
  left: auto;
  top: auto;
  flex: 0 0 12px;
  width: 12px;
  height: 7px;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.conv-dot {
  flex-shrink: 0;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: transparent;
  transform: none; /* pulse keyframes currently use translateY(-50%); update those */
}
```

- [ ] **Step 2: Fix pulse keyframes for non-absolute dots**

Update `@keyframes conv-pulse` so it no longer depends on `translateY(-50%)`:

```css
@keyframes conv-pulse {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.35;
    transform: scale(0.72);
  }
}
```

Keep `.is-working` / `.is-waiting` colors and `prefers-reduced-motion` rule.

- [ ] **Step 3: Manual verify**

Run: `cd app && bun run start` (or existing renderer reload flow). Start a chat so a green working dot appears.

Expected: ≥8px gap between dot and title; idle chats’ titles share the same left edge (empty gutter).

- [ ] **Step 4: Commit** (only if user asked)

```bash
git add app/src/renderer/styles.css
git commit -m "$(cat <<'EOF'
fix: reserve sidebar gutter for activity dots

EOF
)"
```

---

### Task 2: Composer toolbar shared height + Tools contrast

**Files:**
- Modify: `app/src/renderer/styles.css` (`#chat-form`, `.composer-toolbar`, `#attach-btn`, `#tools-toggle`, `.tools-toggle`, `#workspace-label`, `.composer-model .dropdown-trigger`, `#send-btn` / `#chat-form .primary`)

**Interfaces:**
- Consumes: existing IDs in `index.html` composer
- Produces: unified 32px control chrome

- [ ] **Step 1: Add shared composer control metrics**

Near `.composer-toolbar` / `#attach-btn` / `#tools-toggle`, add:

```css
.composer-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.composer-left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
}

#chat-form #attach-btn,
#chat-form #tools-toggle,
#chat-form #workspace-btn,
#chat-form #workspace-label.chip,
#chat-form .composer-model .dropdown-trigger,
#chat-form #send-btn {
  box-sizing: border-box;
  height: 32px;
  min-height: 32px;
  border-radius: 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

#chat-form #attach-btn,
#chat-form #workspace-btn {
  width: 32px;
  padding: 0;
  font-size: 16px;
  line-height: 1;
  border: 1px solid var(--border);
  background: var(--panel-2);
}

#chat-form #tools-toggle {
  width: auto;
  padding: 0 10px;
  gap: 6px;
  border: 1px solid var(--border);
  background: var(--panel-2);
  color: var(--muted);
}

#chat-form #tools-toggle .tools-toggle-label,
#chat-form #tools-toggle .tools-toggle-icon {
  color: inherit;
}

#chat-form #tools-toggle.tools-toggle.active,
#chat-form #tools-toggle.active {
  background: var(--accent-grad);
  color: var(--accent-contrast);
  border-color: transparent;
}

#chat-form #workspace-label.chip {
  max-width: 160px;
  padding: 0 8px 0 10px;
  overflow: hidden;
  flex: 0 1 auto;
  min-width: 0;
}

#chat-form #workspace-label .chip-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

#chat-form .composer-model .dropdown-trigger {
  padding: 0 8px 0 11px;
  max-width: 180px;
}

#chat-form #send-btn {
  padding: 0 14px;
  flex-shrink: 0;
}
```

Adjust selectors if existing `.tools-toggle.active` uses a different class combo — match whatever `tools-toggle.ts` toggles today.

- [ ] **Step 2: Manual verify**

Open a chat with Tools on, a working folder set (long path), and model picker visible.

Expected: all row controls share 32px height; Tools-on label readable on accent; long folder chip ellipsizes; Send remains visible.

- [ ] **Step 3: Commit** (only if user asked)

```bash
git add app/src/renderer/styles.css
git commit -m "$(cat <<'EOF'
fix: unify composer toolbar control heights

EOF
)"
```

---

### Task 3: Customize 3-step wizard + themed fields

**Files:**
- Modify: `app/src/renderer/index.html` (`#settings-panel-customize`)
- Modify: `app/src/renderer/js/customize.ts`
- Create: `app/src/renderer/js/customize-steps.ts` (pure step helpers)
- Create: `app/src/renderer/js/customize-steps.test.ts`
- Modify: `app/src/renderer/styles.css` (Customize wizard styles)

**Interfaces:**
- Consumes: existing `userContext` IPC via `window.api.userContextGet` / `userContextSet`; field IDs `uc-enabled`, `uc-name`, `uc-about`, `uc-work`, `uc-style`, `uc-extra`, `uc-saved`
- Produces:
  - `export type CustomizeStep = 1 | 2 | 3`
  - `export function clampCustomizeStep(n: number): CustomizeStep`
  - `export function nextCustomizeStep(step: CustomizeStep): CustomizeStep`
  - `export function prevCustomizeStep(step: CustomizeStep): CustomizeStep`
  - `export function customizePrimaryLabel(step: CustomizeStep): "Next" | "Done"`

- [ ] **Step 1: Write failing tests for step helpers**

Create `app/src/renderer/js/customize-steps.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";
import {
  clampCustomizeStep,
  nextCustomizeStep,
  prevCustomizeStep,
  customizePrimaryLabel,
} from "./customize-steps";

describe("customize steps", () => {
  test("clamp maps out-of-range to 1..3", () => {
    expect(clampCustomizeStep(0)).toBe(1);
    expect(clampCustomizeStep(99)).toBe(3);
    expect(clampCustomizeStep(2)).toBe(2);
  });

  test("next and prev stay in range", () => {
    expect(nextCustomizeStep(1)).toBe(2);
    expect(nextCustomizeStep(3)).toBe(3);
    expect(prevCustomizeStep(1)).toBe(1);
    expect(prevCustomizeStep(3)).toBe(2);
  });

  test("primary label is Next then Done", () => {
    expect(customizePrimaryLabel(1)).toBe("Next");
    expect(customizePrimaryLabel(2)).toBe("Next");
    expect(customizePrimaryLabel(3)).toBe("Done");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && bun test src/renderer/js/customize-steps.test.ts`

Expected: FAIL (module not found / exports missing).

- [ ] **Step 3: Implement helpers**

Create `app/src/renderer/js/customize-steps.ts`:

```typescript
export type CustomizeStep = 1 | 2 | 3;

export function clampCustomizeStep(n: number): CustomizeStep {
  if (n <= 1) return 1;
  if (n >= 3) return 3;
  return n as CustomizeStep;
}

export function nextCustomizeStep(step: CustomizeStep): CustomizeStep {
  return clampCustomizeStep(step + 1);
}

export function prevCustomizeStep(step: CustomizeStep): CustomizeStep {
  return clampCustomizeStep(step - 1);
}

export function customizePrimaryLabel(step: CustomizeStep): "Next" | "Done" {
  return step === 3 ? "Done" : "Next";
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `cd app && bun test src/renderer/js/customize-steps.test.ts`

Expected: PASS.

- [ ] **Step 5: Restructure Customize HTML**

Replace the body of `#settings-panel-customize` `.settings-panel-body` so structure is:

```html
<div class="settings-panel-body customize-body">
  <p class="settings-panel-sub">…existing intro…</p>
  <div class="setting-row">…Use my context toggle (unchanged IDs)…</div>

  <div class="customize-wizard" data-step="1">
    <div class="customize-steps" role="list" aria-label="Customize steps">
      <span class="customize-step-pill" data-step-n="1" aria-current="step">1</span>
      <span class="customize-step-sep" aria-hidden="true">—</span>
      <span class="customize-step-pill" data-step-n="2">2</span>
      <span class="customize-step-sep" aria-hidden="true">—</span>
      <span class="customize-step-pill" data-step-n="3">3</span>
    </div>
    <p class="customize-step-title" id="customize-step-title">Who you are</p>

    <div class="customize-step" data-step-panel="1">
      <div class="customize-field">
        <label class="field-label" for="uc-name">What should the model call you?</label>
        <input id="uc-name" class="auth-input" placeholder="Yash" autocomplete="off" />
      </div>
      <div class="customize-field">
        <label class="field-label" for="uc-about">About you</label>
        <textarea id="uc-about" class="auth-input customize-textarea" rows="4"
          placeholder="Role, background, what you're responsible for…"></textarea>
      </div>
    </div>

    <div class="customize-step hidden" data-step-panel="2">
      <div class="customize-field">
        <label class="field-label" for="uc-work">What you work on</label>
        <textarea id="uc-work" class="auth-input customize-textarea" rows="4"
          placeholder="Products, stacks, teams, recurring projects…"></textarea>
      </div>
    </div>

    <div class="customize-step hidden" data-step-panel="3">
      <div class="customize-field">
        <label class="field-label" for="uc-style">How replies should be written</label>
        <textarea id="uc-style" class="auth-input customize-textarea" rows="4"
          placeholder="Concise. No preamble. Code in small modules…"></textarea>
      </div>
      <div class="customize-field">
        <label class="field-label" for="uc-extra">Anything else</label>
        <textarea id="uc-extra" class="auth-input customize-textarea" rows="4"
          placeholder="Constraints, preferences, things to avoid…"></textarea>
      </div>
    </div>

    <div class="customize-nav">
      <button type="button" id="customize-back" class="ghost" disabled>Back</button>
      <button type="button" id="customize-next" class="primary">Next</button>
    </div>
  </div>

  <div class="settings-panel-foot"><span id="uc-saved" class="modal-note"></span></div>
</div>
```

Keep field IDs exactly as today so `FIELDS` map still works.

- [ ] **Step 6: Wire step UI in `customize.ts`**

```typescript
import {
  clampCustomizeStep,
  nextCustomizeStep,
  prevCustomizeStep,
  customizePrimaryLabel,
  type CustomizeStep,
} from "./customize-steps.js";

const STEP_TITLES: Record<CustomizeStep, string> = {
  1: "Who you are",
  2: "What you work on",
  3: "How to reply",
};

let step: CustomizeStep = 1;

function paintStep() {
  const root = document.querySelector(".customize-wizard");
  if (!root) return;
  root.setAttribute("data-step", String(step));
  for (const panel of root.querySelectorAll<HTMLElement>("[data-step-panel]")) {
    const n = Number(panel.dataset.stepPanel);
    panel.classList.toggle("hidden", n !== step);
  }
  for (const pill of root.querySelectorAll<HTMLElement>("[data-step-n]")) {
    const n = Number(pill.dataset.stepN) as CustomizeStep;
    pill.classList.toggle("is-current", n === step);
    pill.classList.toggle("is-done", n < step);
    if (n === step) pill.setAttribute("aria-current", "step");
    else pill.removeAttribute("aria-current");
  }
  const title = el("customize-step-title");
  if (title) title.textContent = STEP_TITLES[step];
  const back = el("customize-back") as HTMLButtonElement;
  const next = el("customize-next") as HTMLButtonElement;
  if (back) back.disabled = step === 1;
  if (next) next.textContent = customizePrimaryLabel(step);
}

// In initCustomize, after field bindings:
el("customize-back").onclick = () => {
  step = prevCustomizeStep(step);
  paintStep();
};
el("customize-next").onclick = () => {
  if (step === 3) {
    // Done: stay on step 3; optional brief indicator — do not close Settings.
    paintStep();
    return;
  }
  step = nextCustomizeStep(step);
  paintStep();
};
```

Call `paintStep()` at end of `paintCustomize()` / `initCustomize()`.

- [ ] **Step 7: Add Customize CSS**

```css
.customize-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0 0 14px;
  width: 100%;
}

.customize-textarea.auth-input,
textarea.customize-textarea {
  display: block;
  width: 100%;
  min-height: 96px;
  resize: vertical;
  box-sizing: border-box;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 10px;
  color: var(--text);
  padding: 11px 12px;
  font-family: inherit;
  font-size: 14px;
  line-height: 1.4;
}

.customize-wizard {
  margin-top: 8px;
}

.customize-steps {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  color: var(--muted);
  font-size: 13px;
}

.customize-step-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 999px;
  border: 1px solid var(--border);
}

.customize-step-pill.is-current {
  background: var(--accent-grad);
  color: var(--accent-contrast);
  border-color: transparent;
}

.customize-step-pill.is-done {
  border-color: var(--accent);
  color: var(--accent);
}

.customize-step-title {
  margin: 0 0 12px;
  font-size: 15px;
  font-weight: 600;
  color: var(--text);
}

.customize-nav {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  margin-top: 8px;
}

.customize-nav .primary,
.customize-nav .ghost {
  min-height: 32px;
}
```

Ensure `.hidden { display: none !important; }` (or existing `.hidden`) applies to step panels.

- [ ] **Step 8: Manual verify**

Open Settings → Customize. Confirm textareas are full-width dark fields; Back/Next walk 1→2→3; Done stays on step 3; edits still show “Saved”; reload restores values.

- [ ] **Step 9: Commit** (only if user asked)

```bash
git add app/src/renderer/index.html app/src/renderer/js/customize.ts \
  app/src/renderer/js/customize-steps.ts app/src/renderer/js/customize-steps.test.ts \
  app/src/renderer/styles.css
git commit -m "$(cat <<'EOF'
feat: rebuild Customize as a three-step wizard

EOF
)"
```

---

### Task 4: Document soft-nudge helper (TDD)

**Files:**
- Create: `app/src/main/documents/doc-nudge.ts`
- Create: `app/src/main/documents/doc-nudge.test.ts`

**Interfaces:**
- Produces:
  - `export const DOCUMENT_GENERATE_NUDGE = "You already ran research tools. Prefer calling generate_document now with full markdown. Only search/fetch again if a critical fact is still missing."`
  - `export const RESEARCH_TOOLS = new Set(["web_search", "http_fetch"])`
  - `export interface DocNudgeState { documentIntent: boolean; researchOnlyRounds: number; attemptedGenerate: boolean; nudged: boolean }`
  - `export function isResearchOnlyRound(toolNames: string[]): boolean`
  - `export function shouldNudgeDocumentGenerate(state: DocNudgeState): boolean`
  - `export function recordToolRound(state: DocNudgeState, toolNames: string[]): DocNudgeState` (immutable update helper optional but preferred)

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, expect, test } from "bun:test";
import {
  DOCUMENT_GENERATE_NUDGE,
  isResearchOnlyRound,
  shouldNudgeDocumentGenerate,
  recordToolRound,
  type DocNudgeState,
} from "./doc-nudge";

function base(over: Partial<DocNudgeState> = {}): DocNudgeState {
  return {
    documentIntent: true,
    researchOnlyRounds: 0,
    attemptedGenerate: false,
    nudged: false,
    ...over,
  };
}

describe("doc nudge", () => {
  test("research-only round detection", () => {
    expect(isResearchOnlyRound(["web_search"])).toBe(true);
    expect(isResearchOnlyRound(["web_search", "http_fetch"])).toBe(true);
    expect(isResearchOnlyRound(["http_fetch", "generate_document"])).toBe(false);
    expect(isResearchOnlyRound([])).toBe(false);
  });

  test("no nudge before 2 research-only rounds", () => {
    expect(shouldNudgeDocumentGenerate(base({ researchOnlyRounds: 0 }))).toBe(false);
    expect(shouldNudgeDocumentGenerate(base({ researchOnlyRounds: 1 }))).toBe(false);
  });

  test("nudge at 2 when document intent and not yet nudged", () => {
    expect(shouldNudgeDocumentGenerate(base({ researchOnlyRounds: 2 }))).toBe(true);
    expect(DOCUMENT_GENERATE_NUDGE).toMatch(/generate_document/);
  });

  test("suppress when no document intent, already nudged, or generate attempted", () => {
    expect(shouldNudgeDocumentGenerate(base({ researchOnlyRounds: 2, documentIntent: false }))).toBe(false);
    expect(shouldNudgeDocumentGenerate(base({ researchOnlyRounds: 2, nudged: true }))).toBe(false);
    expect(shouldNudgeDocumentGenerate(base({ researchOnlyRounds: 2, attemptedGenerate: true }))).toBe(false);
  });

  test("recordToolRound increments and flags generate", () => {
    let s = base();
    s = recordToolRound(s, ["web_search"]);
    expect(s.researchOnlyRounds).toBe(1);
    s = recordToolRound(s, ["http_fetch"]);
    expect(s.researchOnlyRounds).toBe(2);
    s = recordToolRound(s, ["generate_document"]);
    expect(s.attemptedGenerate).toBe(true);
    expect(s.researchOnlyRounds).toBe(2); // unchanged when not research-only
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `cd app && bun test src/main/documents/doc-nudge.test.ts`

Expected: FAIL (missing module).

- [ ] **Step 3: Implement `doc-nudge.ts`**

```typescript
export const DOCUMENT_GENERATE_NUDGE =
  "You already ran research tools. Prefer calling generate_document now with full markdown. Only search/fetch again if a critical fact is still missing.";

export const RESEARCH_TOOLS = new Set(["web_search", "http_fetch"]);

export interface DocNudgeState {
  documentIntent: boolean;
  researchOnlyRounds: number;
  attemptedGenerate: boolean;
  nudged: boolean;
}

export function isResearchOnlyRound(toolNames: string[]): boolean {
  if (!toolNames.length) return false;
  return toolNames.every((n) => RESEARCH_TOOLS.has(n));
}

export function shouldNudgeDocumentGenerate(state: DocNudgeState): boolean {
  return (
    state.documentIntent &&
    !state.nudged &&
    !state.attemptedGenerate &&
    state.researchOnlyRounds >= 2
  );
}

export function recordToolRound(state: DocNudgeState, toolNames: string[]): DocNudgeState {
  const names = toolNames.filter(Boolean);
  const attemptedGenerate = state.attemptedGenerate || names.includes("generate_document");
  const researchOnlyRounds =
    isResearchOnlyRound(names) ? state.researchOnlyRounds + 1 : state.researchOnlyRounds;
  return { ...state, attemptedGenerate, researchOnlyRounds };
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `cd app && bun test src/main/documents/doc-nudge.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit** (only if user asked)

```bash
git add app/src/main/documents/doc-nudge.ts app/src/main/documents/doc-nudge.test.ts
git commit -m "$(cat <<'EOF'
feat: add document research soft-nudge helper

EOF
)"
```

---

### Task 5: Wire nudge into `ipc.ts` + `workers.ts` (+ optional fetch dedupe)

**Files:**
- Modify: `app/src/main/ipc.ts` (tool loop ~1296–1411; document intent already detected ~899–905)
- Modify: `app/src/main/agents/workers.ts` (`runTool` loop ~156–200)
- Modify: `app/src/main/tools/exec.ts` (optional soft duplicate URL note for `http_fetch`)
- Test: existing `doc-nudge.test.ts` covers decision; smoke via typecheck

**Interfaces:**
- Consumes: `shouldNudgeDocumentGenerate`, `recordToolRound`, `DOCUMENT_GENERATE_NUDGE` from `./documents/doc-nudge`
- Consumes: `documentIntent.detect(lastUser.content)` already available in ipc turn setup
- Produces: at most one extra `{ role: "system", content: DOCUMENT_GENERATE_NUDGE }` in `full` / worker `messages` per turn

- [ ] **Step 1: Track nudge state in the single-agent loop**

In `ipc.ts`, where `wantedFormat` is computed (when tools on), keep a boolean for the turn:

```typescript
const wantsDocument = !!(lastUser && documentIntent.detect(lastUser.content));
let docNudge = {
  documentIntent: wantsDocument,
  researchOnlyRounds: 0,
  attemptedGenerate: false,
  nudged: false,
};
```

Inside the `for (;;)` tool loop, **after** executing a round’s tool calls (after the `for (const call of calls)` loop that pushes tool results), before the next `chatStream`:

```typescript
import {
  DOCUMENT_GENERATE_NUDGE,
  recordToolRound,
  shouldNudgeDocumentGenerate,
} from "./documents/doc-nudge";

// after processing `calls` for this round:
docNudge = recordToolRound(
  docNudge,
  calls.map((c) => c.function?.name || "")
);
if (shouldNudgeDocumentGenerate(docNudge)) {
  full.push({ role: "system", content: DOCUMENT_GENERATE_NUDGE });
  docNudge = { ...docNudge, nudged: true };
}
```

Place the record+nudge **after** tools for the current round finish and **before** the next iteration’s model call (i.e. at end of loop body after tool execution, so the next `chatStream` sees it). Do **not** change `rounds >= 15` break.

- [ ] **Step 2: Same pattern in `workers.ts` `runTool`**

Initialize nudge state from step goal / specialist: for document kind allowlist, set `documentIntent: true` when `allowlistFor(step.kind)` includes `generate_document` (or when `step.kind === "document"`). After each tool round’s executions:

```typescript
docNudge = recordToolRound(docNudge, calls.map(...));
if (shouldNudgeDocumentGenerate(docNudge)) {
  messages.push({ role: "system", content: DOCUMENT_GENERATE_NUDGE });
  docNudge = { ...docNudge, nudged: true };
}
```

Workers still stop at `MAX_TOOL_ROUNDS = 3`; nudge may fire after round 2 research-only before the final model call.

- [ ] **Step 3 (optional light): duplicate `http_fetch` URL hint**

In `exec.ts` `http_fetch` path, accept optional turn-scoped `Set` via context, **or** keep a WeakMap keyed by confirm/context object. Prefer extending `context` with `fetchedUrls?: Set<string>`:

In ipc when calling `toolsExec.execute`, pass:

```typescript
fetchedUrls, // Set created once per turn
```

In `http_fetch` case:

```typescript
const url = String(args.url || "");
if (context?.fetchedUrls?.has(url)) {
  const body = await httpFetch(url, ...);
  return `Note: this URL was already fetched earlier this turn.\n\n${body}`;
}
context?.fetchedUrls?.add(url);
return httpFetch(...);
```

Still allow the fetch (no hard block).

- [ ] **Step 4: Typecheck + unit tests**

Run:

```bash
cd app && bun test src/main/documents/doc-nudge.test.ts src/renderer/js/customize-steps.test.ts
cd app && bun run typecheck
```

Expected: tests PASS; typecheck clean.

- [ ] **Step 5: Manual smoke**

Tools on → “create a PDF on how to publish my android react native app on Play Store”. After two research-only rounds, confirm (via logging or by observing the model shifting to `generate_document`) that a single nudge was injected; Stop still works; non-PDF chat has no nudge.

- [ ] **Step 6: Commit** (only if user asked)

```bash
git add app/src/main/ipc.ts app/src/main/agents/workers.ts app/src/main/tools/exec.ts \
  app/src/main/documents/doc-nudge.ts app/src/main/documents/doc-nudge.test.ts
git commit -m "$(cat <<'EOF'
feat: soft-nudge document turns after research-only rounds

EOF
)"
```

---

## Self-review (plan vs spec)

| Spec requirement | Task |
|------------------|------|
| Sidebar 12px gutter + 8px gap, no absolute overlay | Task 1 |
| Composer 32px / 10px radius / 8px gap; Tools contrast; chip truncate | Task 2 |
| Customize 3-step wizard; themed textareas; autosave; Done stays | Task 3 |
| Soft nudge after 2 research-only rounds; once; ipc + workers | Tasks 4–5 |
| Optional duplicate URL hint | Task 5 Step 3 |
| Keep 15 rounds; no force generate; no thin-content/PDF CSS changes | Constraints + Task 5 |
| Unit tests for nudge | Task 4 |

No TBD placeholders. Helper names consistent: `shouldNudgeDocumentGenerate`, `recordToolRound`, `DOCUMENT_GENERATE_NUDGE`.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-10-composer-customize-document-nudge.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — run tasks in this session with executing-plans checkpoints  

Which approach?
