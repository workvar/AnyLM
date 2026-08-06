# Web Research Follow-ups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prompt-only “Do it / this / that / complete” heuristics (skill + shared tools line) and a URL-paste chip that enables Web research for this chat or globally, with persisted `skillOverrides` / `useTools`.

**Architecture:** Pure helpers for URL detection and chip visibility. Skills registry accepts optional `extraIds` so a conversation can opt in Web research without flipping the rail. Renderer persists overrides on chat/thread, sends them on `chat:start`, restores ⚒ from `useTools`, and shows a composer chip. No runtime invention of tool calls from confirmation text.

**Tech Stack:** Electron main + renderer (vanilla JS/TS), Bun tests (`bun:test`), existing skills registry and chat/thread JSON stores.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-06-web-research-followups-design.md`
- Parent: `docs/superpowers/specs/2026-08-06-web-research-skill-tool-recovery-design.md` (already implemented)
- Confirm / anaphora: **prompt only** — never invent tool calls from “Do it” with no JSON
- Shared tools follow-up line whenever `useTools` is true
- Chip: Enable (per-conversation override) · Keep enabled (global rail) · Dismiss (ephemeral)
- Persist `skillOverrides?: string[]` and `useTools?: boolean` on `StandaloneChat` and `ProjectThread`
- Enable / Keep enabled also set ⚒ on and persist `useTools: true`
- Persist every composer ⚒ toggle to the open conversation
- No silent auto-enable of skill or ⚒; no XML recovery; no nudges for other skills
- Commit steps run only when the user explicitly asks to commit (user rule); otherwise skip commits and leave changes unstaged

## File map

| File | Responsibility |
|------|----------------|
| `app/src/renderer/js/has-http-url.ts` | Pure `hasHttpUrl(text)` |
| `app/src/renderer/js/has-http-url.test.ts` | URL detector tests |
| `app/src/renderer/js/web-research-hint.ts` | Chip visibility helper + DOM chip wiring |
| `app/src/renderer/js/web-research-hint.test.ts` | Visibility matrix tests |
| `app/src/main/tools/follow-up-prompt.ts` | Shared tools confirmation system block |
| `app/src/main/tools/follow-up-prompt.test.ts` | Assert prompt mentions do it / this / shell caution |
| `app/src/main/skills/builtins.ts` | Expand web-research instructions |
| `app/src/main/skills/builtins.test.ts` | Assert anaphora + shell caution |
| `app/src/main/skills/registry.ts` | `extraIds` on instructions / ollamaTools / customToolNames |
| `app/src/main/skills/registry-extra.test.ts` | Override merge when globally off |
| `app/src/types/domain.d.ts` | Optional fields on chat/thread |
| `app/src/types/api.d.ts` | `skillOverrides` on `ChatPayload` |
| `app/src/main/ipc.ts` | Pass extras + inject follow-up prompt |
| `app/src/renderer/js/chat.ts` | Persist/restore ⚒; send overrides; init hint |
| `app/src/renderer/js/chats.ts` / `threads.ts` | Restore ⚒ on open |
| `app/src/renderer/js/turns.ts` | Forward `skillOverrides` in `api.chat` |
| `app/src/renderer/index.html` | Chip host element |
| `app/src/renderer/styles.css` | Chip strip styles |

Paths below are relative to `app/` unless noted.

---

### Task 1: URL detector + chip visibility helpers

**Files:**
- Create: `src/renderer/js/has-http-url.ts`
- Create: `src/renderer/js/has-http-url.test.ts`
- Create: `src/renderer/js/web-research-hint.ts` (export pure `shouldShowWebResearchHint` first; DOM later in Task 5)
- Create: `src/renderer/js/web-research-hint.test.ts`

**Interfaces:**
- Produces:
  - `hasHttpUrl(text: string): boolean`
  - `shouldShowWebResearchHint(opts: { text: string; globalEnabled: boolean; skillOverrides: string[] | null | undefined; dismissed: boolean }): boolean`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/renderer/js/has-http-url.test.ts
import { describe, expect, test } from "bun:test";
import { hasHttpUrl } from "./has-http-url";

describe("hasHttpUrl", () => {
  test("https URL", () => {
    expect(hasHttpUrl("see https://yasharyan.dev please")).toBe(true);
  });
  test("http URL", () => {
    expect(hasHttpUrl("http://example.com/path")).toBe(true);
  });
  test("no scheme", () => {
    expect(hasHttpUrl("example.com/foo")).toBe(false);
  });
  test("empty", () => {
    expect(hasHttpUrl("")).toBe(false);
    expect(hasHttpUrl(null as unknown as string)).toBe(false);
  });
});
```

```typescript
// src/renderer/js/web-research-hint.test.ts
import { describe, expect, test } from "bun:test";
import { shouldShowWebResearchHint } from "./web-research-hint";

describe("shouldShowWebResearchHint", () => {
  const base = {
    text: "Read https://example.com",
    globalEnabled: false,
    skillOverrides: [] as string[],
    dismissed: false,
  };
  test("shows when URL and skill inactive", () => {
    expect(shouldShowWebResearchHint(base)).toBe(true);
  });
  test("hidden when global enabled", () => {
    expect(shouldShowWebResearchHint({ ...base, globalEnabled: true })).toBe(false);
  });
  test("hidden when override present", () => {
    expect(
      shouldShowWebResearchHint({ ...base, skillOverrides: ["web-research"] })
    ).toBe(false);
  });
  test("hidden when dismissed", () => {
    expect(shouldShowWebResearchHint({ ...base, dismissed: true })).toBe(false);
  });
  test("hidden without URL", () => {
    expect(shouldShowWebResearchHint({ ...base, text: "no link here" })).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd app && bun test src/renderer/js/has-http-url.test.ts src/renderer/js/web-research-hint.test.ts
```

Expected: FAIL (modules missing).

- [ ] **Step 3: Implement helpers**

```typescript
// src/renderer/js/has-http-url.ts
const RE = /https?:\/\/[^\s<>"'`]+/i;

function hasHttpUrl(text: unknown): boolean {
  return RE.test(String(text ?? ""));
}

export { hasHttpUrl };
```

```typescript
// src/renderer/js/web-research-hint.ts
import { hasHttpUrl } from "./has-http-url";

const SKILL_ID = "web-research";

function shouldShowWebResearchHint(opts: {
  text: string;
  globalEnabled: boolean;
  skillOverrides: string[] | null | undefined;
  dismissed: boolean;
}): boolean {
  if (opts.dismissed) return false;
  if (opts.globalEnabled) return false;
  if ((opts.skillOverrides || []).includes(SKILL_ID)) return false;
  return hasHttpUrl(opts.text);
}

export { shouldShowWebResearchHint, SKILL_ID };
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd app && bun test src/renderer/js/has-http-url.test.ts src/renderer/js/web-research-hint.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit (only if user asked)**

```bash
git add app/src/renderer/js/has-http-url.ts app/src/renderer/js/has-http-url.test.ts \
  app/src/renderer/js/web-research-hint.ts app/src/renderer/js/web-research-hint.test.ts
git commit -m "$(cat <<'EOF'
feat: add URL detect and Web research hint visibility helpers

EOF
)"
```

---

### Task 2: Prompt pack (shared follow-up + Web research copy)

**Files:**
- Create: `src/main/tools/follow-up-prompt.ts`
- Create: `src/main/tools/follow-up-prompt.test.ts`
- Modify: `src/main/skills/builtins.ts` (webResearch.instructions)
- Modify: `src/main/skills/builtins.test.ts`

**Interfaces:**
- Produces: `followUpPromptBlock(): string` — non-empty system block for tools-on turns
- Updates: web-research instructions cover this/that/complete and shell caution

- [ ] **Step 1: Write the failing tests**

```typescript
// src/main/tools/follow-up-prompt.test.ts
import { describe, expect, test } from "bun:test";
import { followUpPromptBlock } from "./follow-up-prompt";

describe("followUpPromptBlock", () => {
  test("mentions confirmations and shell caution", () => {
    const s = followUpPromptBlock().toLowerCase();
    expect(s).toMatch(/do it|go ahead/);
    expect(s).toMatch(/this|that|complete/);
    expect(s).toMatch(/shell/);
  });
});
```

Extend `builtins.test.ts` web-research test assertions:

```typescript
expect(s!.instructions.toLowerCase()).toMatch(/this|that/);
expect(s!.instructions.toLowerCase()).toMatch(/complete/);
expect(s!.instructions.toLowerCase()).toMatch(/shell/);
```

(Keep existing do it / go ahead / json|example assertions.)

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd app && bun test src/main/tools/follow-up-prompt.test.ts src/main/skills/builtins.test.ts
```

Expected: FAIL (missing module and/or missing anaphora/shell in instructions).

- [ ] **Step 3: Implement**

```typescript
// src/main/tools/follow-up-prompt.ts
function followUpPromptBlock(): string {
  return (
    "Tool follow-ups: If you proposed a tool and the user replies with a short confirmation " +
    'or reference (e.g. "do it", "go ahead", "yes", "this", "that", "the link", "complete", "finish it"), ' +
    "call that same tool with the arguments implied by the prior turn. " +
    "Do not treat the confirmation as a shell command unless they clearly asked to run a shell command."
  );
}

export { followUpPromptBlock };
```

Replace `webResearch.instructions` in `builtins.ts` with:

```typescript
  instructions:
    "You can search the web with web_search and read pages with http_fetch. " +
    "For live URLs or current facts: call web_search and/or http_fetch — do not invent page contents. " +
    "Never paste example JSON or pretend a tool ran; use the tool-calling interface. " +
    "If the user says \"do it\", \"go ahead\", \"yes\", \"fetch it\", or refers to a URL or proposal " +
    "with \"this\", \"that\", \"the link\", \"complete\", or \"finish it\", call the http_fetch or " +
    "web_search you proposed (using the URL or query from context). " +
    "Do not treat those confirmations as a run_shell command or as a new unrelated task.",
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd app && bun test src/main/tools/follow-up-prompt.test.ts src/main/skills/builtins.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit (only if user asked)**

```bash
git add app/src/main/tools/follow-up-prompt.ts app/src/main/tools/follow-up-prompt.test.ts \
  app/src/main/skills/builtins.ts app/src/main/skills/builtins.test.ts
git commit -m "$(cat <<'EOF'
feat: strengthen Web research and shared tool follow-up prompts

EOF
)"
```

---

### Task 3: Skills registry `extraIds` merge

**Files:**
- Modify: `src/main/skills/registry.ts`
- Create: `src/main/skills/registry-extra.test.ts`

**Interfaces:**
- Consumes: existing `list()`, `builtinSkill`, `toolsRegistry`
- Produces:
  - `instructionsBlock(extraIds?: string[]): string`
  - `ollamaTools(extraIds?: string[]): OllamaToolDef[]` (same return shape as today)
  - `customToolNames(extraIds?: string[]): Set<string>`
  - Internal: `skillsForTurn(extraIds?: string[])` = skills where `enabled || extraIds.includes(id)`

- [ ] **Step 1: Write the failing test**

```typescript
// src/main/skills/registry-extra.test.ts
import { describe, expect, test } from "bun:test";
import * as skillsRegistry from "./registry";

describe("skills registry extraIds", () => {
  test("web-research instructions and tools when only in extraIds", () => {
    // Assumes web-research is globally off in the test userData (default for fresh store).
    // If a prior test enabled it, toggle off first:
    skillsRegistry.toggle("web-research", false);

    const block = skillsRegistry.instructionsBlock(["web-research"]);
    expect(block).toMatch(/Web research/i);
    expect(block.toLowerCase()).toMatch(/http_fetch/);

    const defs = skillsRegistry.ollamaTools(["web-research"]);
    const names = defs.map((d) => d.function.name);
    expect(names).toContain("web_search");
    expect(names).toContain("http_fetch");

    const allow = skillsRegistry.customToolNames(["web-research"]);
    expect(allow.has("http_fetch")).toBe(true);
    expect(allow.has("web_search")).toBe(true);

    const empty = skillsRegistry.instructionsBlock([]);
    expect(empty).not.toMatch(/Web research/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd app && bun test src/main/skills/registry-extra.test.ts
```

Expected: FAIL (`instructionsBlock` ignores extras) or type error.

- [ ] **Step 3: Implement `skillsForTurn` and thread through helpers**

In `registry.ts`, add:

```typescript
function skillsForTurn(extraIds?: string[]) {
  const extras = new Set(extraIds || []);
  return list().filter((s) => s.enabled || extras.has(s.id));
}
```

Change `instructionsBlock`, `ollamaTools`, and `customToolNames` to take optional `extraIds?: string[]` and iterate `skillsForTurn(extraIds)` instead of `enabledSkills()`.

Keep `enabledSkills()` for UI/`findConnectorTool` unchanged (overrides only affect chat turns via the three helpers).

Export list unchanged except the three function signatures.

- [ ] **Step 4: Run tests**

```bash
cd app && bun test src/main/skills/registry-extra.test.ts src/main/skills/builtins.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit (only if user asked)**

```bash
git add app/src/main/skills/registry.ts app/src/main/skills/registry-extra.test.ts
git commit -m "$(cat <<'EOF'
feat: merge conversation skillOverrides into skill tool injection

EOF
)"
```

---

### Task 4: Types + agent loop wiring

**Files:**
- Modify: `src/types/domain.d.ts` (`StandaloneChat`, `ProjectThread`)
- Modify: `src/types/api.d.ts` (`ChatPayload`)
- Modify: `src/main/ipc.ts` (destructure `skillOverrides`; inject follow-up + pass extras)
- Modify: `src/renderer/js/turns.ts` (forward overrides)
- Modify: `src/renderer/js/chat.ts` (pass overrides into `runTurn`)

**Interfaces:**
- Consumes: `followUpPromptBlock`, `instructionsBlock(extra)`, `ollamaTools(extra)`, `customToolNames(extra)`
- Produces: turn payload includes `skillOverrides?: string[]`

- [ ] **Step 1: Extend domain + API types**

`StandaloneChat` and `ProjectThread`:

```typescript
  skillOverrides?: string[];
  useTools?: boolean;
```

`ChatPayload`:

```typescript
  useTools?: boolean;
  skillOverrides?: string[];
```

- [ ] **Step 2: Wire `ipc.ts`**

Change handler destructure to include `skillOverrides`.

Inside `if (useTools)`:

```typescript
const extras = Array.isArray(skillOverrides) ? skillOverrides.filter(Boolean) : [];
const follow = followUpPromptBlock();
if (follow) blocks.push(follow);
const skillBlock = skillsRegistry.instructionsBlock(extras);
if (skillBlock) blocks.push(skillBlock);
// ... existing workspace + documentIntent unchanged ...
```

And for tool defs:

```typescript
const fromSkills = skillsRegistry
  .ollamaTools(extras)
  .filter((d) => !seen.has(d.function.name));
toolDefs = [...base, ...fromSkills];
skillToolAllow = skillsRegistry.customToolNames(extras);
```

Add import:

```typescript
import { followUpPromptBlock } from "./tools/follow-up-prompt";
```

- [ ] **Step 3: Forward from renderer**

In `chat.ts` `sendMessage` → `runTurn`, add:

```typescript
skillOverrides: (state.mode === "chat" ? state.current?.skillOverrides : state.thread?.skillOverrides) || [],
```

In `turns.ts` `api.chat` payload:

```typescript
useTools: ctx.useTools,
skillOverrides: ctx.skillOverrides || [],
```

- [ ] **Step 4: Typecheck**

```bash
cd app && bun run typecheck
```

Expected: PASS (no new errors on these files).

- [ ] **Step 5: Commit (only if user asked)**

```bash
git add app/src/types/domain.d.ts app/src/types/api.d.ts app/src/main/ipc.ts \
  app/src/renderer/js/turns.ts app/src/renderer/js/chat.ts
git commit -m "$(cat <<'EOF'
feat: pass skillOverrides into chat turns and inject follow-up prompt

EOF
)"
```

---

### Task 5: Persist ⚒ + composer Web research chip

**Files:**
- Modify: `src/renderer/js/chat.ts` (export set/get tools; persist toggle; init hint)
- Modify: `src/renderer/js/chats.ts` / `threads.ts` (restore ⚒ on open)
- Modify: `src/renderer/js/web-research-hint.ts` (DOM: show/hide, Enable / Keep enabled / Dismiss)
- Modify: `src/renderer/index.html` (host `#web-research-hint`)
- Modify: `src/renderer/styles.css` (hint strip)
- Modify: `src/renderer/js/app.ts` (call `initWebResearchHint` if not from chat init)

**Interfaces:**
- Consumes: `shouldShowWebResearchHint`, `SKILL_ID`, `window.api.skillsList` / `skillsToggle` / `updateChat` / `updateThread`
- Produces: `setUseTools(on: boolean)`, `getUseTools(): boolean`, `initWebResearchHint()`, `syncWebResearchHint()`

- [ ] **Step 1: HTML + CSS**

In `index.html`, above `#attach-chips`:

```html
<div id="web-research-hint" class="web-research-hint hidden" role="status"></div>
```

In `styles.css`:

```css
.web-research-hint {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 8px 18px 0;
  font-size: 12px;
  color: var(--muted);
}
.web-research-hint.hidden {
  display: none;
}
.web-research-hint .hint-actions {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}
.web-research-hint button {
  font: inherit;
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--panel-2);
  color: var(--text);
  cursor: pointer;
}
.web-research-hint button.primary-hint {
  border-color: var(--accent, var(--border));
}
.web-research-hint button.hint-dismiss {
  border: none;
  background: transparent;
  color: var(--muted);
  padding: 2px 4px;
}
```

- [ ] **Step 2: Persist / restore ⚒ in `chat.ts`**

Refactor tools toggle state:

```typescript
let useTools = false;

export function getUseTools() {
  return useTools;
}

export function setUseTools(on: boolean, { persist = true } = {}) {
  useTools = !!on;
  const toggle = el("tools-toggle");
  toggle.classList.toggle("active", useTools);
  toggle.title = useTools ? "Tools enabled for this chat" : "Let the model use tools";
  if (persist) void persistConversationPatch({ useTools });
}

async function persistConversationPatch(patch: Record<string, unknown>) {
  if (state.mode === "chat" && state.current) {
    state.current = { ...state.current, ...patch };
    await window.api.updateChat(state.current.id, patch);
  } else if (state.mode === "project" && state.current && state.thread) {
    state.thread = { ...state.thread, ...patch };
    await window.api.updateThread(state.current.id, state.thread.id, patch);
  }
}
```

Toggle click: `setUseTools(!useTools)`.

In `selectChat` / `openThread` after opening convo:

```typescript
import { setUseTools } from "./chat.js";
// ...
setUseTools(!!state.current.useTools, { persist: false });
// openThread:
setUseTools(!!state.thread.useTools, { persist: false });
```

Avoid circular imports: if `chats.ts` importing `chat.ts` is awkward, put `setUseTools` in a tiny `tools-toggle.ts` module both import — prefer extracting if cycles appear.

- [ ] **Step 3: Finish `web-research-hint.ts` DOM**

```typescript
// Append to web-research-hint.ts
import { el } from "./dom.js";
import { state } from "./state.js";
import { setUseTools } from "./chat.js"; // or tools-toggle.js

let dismissed = false;
let bound = false;

function currentOverrides(): string[] {
  if (state.mode === "chat") return state.current?.skillOverrides || [];
  if (state.mode === "project") return state.thread?.skillOverrides || [];
  return [];
}

async function isGlobalWebResearchEnabled(): Promise<boolean> {
  const skills = await window.api.skillsList();
  const s = skills.find((x) => x.id === SKILL_ID);
  return !!(s && s.enabled);
}

async function persistPatch(patch: Record<string, unknown>) {
  if (state.mode === "chat" && state.current) {
    state.current = { ...state.current, ...patch };
    await window.api.updateChat(state.current.id, patch);
  } else if (state.mode === "project" && state.current && state.thread) {
    state.thread = { ...state.thread, ...patch };
    await window.api.updateThread(state.current.id, state.thread.id, patch);
  }
}

async function syncWebResearchHint() {
  const host = el("web-research-hint");
  if (!host) return;
  const input = el("chat-input") as HTMLTextAreaElement;
  const globalEnabled = await isGlobalWebResearchEnabled();
  const show = shouldShowWebResearchHint({
    text: input?.value || "",
    globalEnabled,
    skillOverrides: currentOverrides(),
    dismissed,
  });
  host.classList.toggle("hidden", !show);
  if (!show) return;
  if (!host.dataset.ready) {
    host.innerHTML = "";
    const msg = document.createElement("span");
    msg.textContent = "This looks like a link — enable Web research?";
    const actions = document.createElement("span");
    actions.className = "hint-actions";
    const enable = document.createElement("button");
    enable.type = "button";
    enable.className = "primary-hint";
    enable.textContent = "Enable";
    enable.onclick = async () => {
      const next = [...new Set([...currentOverrides(), SKILL_ID])];
      await persistPatch({ skillOverrides: next, useTools: true });
      setUseTools(true, { persist: false });
      dismissed = false;
      await syncWebResearchHint();
    };
    const keep = document.createElement("button");
    keep.type = "button";
    keep.textContent = "Keep enabled";
    keep.onclick = async () => {
      await window.api.skillsToggle(SKILL_ID, true);
      const next = currentOverrides().filter((id) => id !== SKILL_ID);
      await persistPatch({ skillOverrides: next, useTools: true });
      setUseTools(true, { persist: false });
      dismissed = false;
      await syncWebResearchHint();
    };
    const dismiss = document.createElement("button");
    dismiss.type = "button";
    dismiss.className = "hint-dismiss";
    dismiss.setAttribute("aria-label", "Dismiss");
    dismiss.textContent = "✕";
    dismiss.onclick = async () => {
      dismissed = true;
      await syncWebResearchHint();
    };
    actions.append(enable, keep, dismiss);
    host.append(msg, actions);
    host.dataset.ready = "1";
  }
}

function initWebResearchHint() {
  if (bound) return;
  bound = true;
  const input = el("chat-input");
  input.addEventListener("input", () => {
    dismissed = false; // new edit after dismiss: re-evaluate; if still same URL+dismissed, keep dismissed until URL changes — simpler v1: clear dismiss only when text loses URL
    void syncWebResearchHint();
  });
  input.addEventListener("paste", () => {
    queueMicrotask(() => void syncWebResearchHint());
  });
  void syncWebResearchHint();
}

function resetWebResearchHintDismiss() {
  dismissed = false;
  void syncWebResearchHint();
}

export {
  shouldShowWebResearchHint,
  SKILL_ID,
  initWebResearchHint,
  syncWebResearchHint,
  resetWebResearchHintDismiss,
};
```

**Dismiss behavior (exact):** On `input`, if `!hasHttpUrl(input.value)` set `dismissed = false`. If URL still present, leave `dismissed` as-is. On conversation switch (`selectChat` / `openThread`), call `resetWebResearchHintDismiss()`.

Simplify the `input` listener accordingly (do not clear dismiss on every keystroke).

- [ ] **Step 4: Init + conversation switch**

From `initToolUse` or `app.ts` boot: `initWebResearchHint()`.

After `selectChat` / `openThread`: `resetWebResearchHintDismiss()` + `setUseTools(...)`.

- [ ] **Step 5: Manual smoke**

1. Web research Off, paste `https://example.com` → chip appears.
2. Enable → chip gone; Skills rail still Off; send with ⚒ on → skill instructions apply (model can fetch).
3. Reopen chat → ⚒ still on; override still present; no chip.
4. Keep enabled on a fresh paste → rail On; override cleared.
5. Dismiss → chip hidden until URL removed then pasted again (or new conversation).

- [ ] **Step 6: Run all related tests + typecheck**

```bash
cd app && bun test \
  src/renderer/js/has-http-url.test.ts \
  src/renderer/js/web-research-hint.test.ts \
  src/main/tools/follow-up-prompt.test.ts \
  src/main/skills/builtins.test.ts \
  src/main/skills/registry-extra.test.ts
bun run typecheck
```

Expected: all PASS.

- [ ] **Step 7: Commit (only if user asked)**

```bash
git add app/src/renderer/js/chat.ts app/src/renderer/js/chats.ts app/src/renderer/js/threads.ts \
  app/src/renderer/js/web-research-hint.ts app/src/renderer/index.html app/src/renderer/styles.css \
  app/src/renderer/js/app.ts
git commit -m "$(cat <<'EOF'
feat: URL chip to enable Web research per chat or globally

EOF
)"
```

---

### Task 6: Spec coverage checklist

**Files:** none new (verification only)

- [ ] **Step 1: Run full test set from Task 5 Step 6**

Expected: PASS.

- [ ] **Step 2: Map success criteria**

| Criterion | Verify |
|-----------|--------|
| Paste URL → chip; Enable → override without rail; reopen keeps override | Manual Task 5 |
| Keep enabled → rail On, override cleared | Manual Task 5 |
| Do it / this / complete prompt-only | Task 2 tests + shared block in ipc |
| Recovery / Calendar unchanged | No changes to recover-tool-calls; builtins connector test |

- [ ] **Step 3: Commit plan/spec only if user asked**

Include `docs/superpowers/specs/2026-08-06-web-research-followups-design.md` and this plan.

---

## Spec coverage (self-review)

| Spec requirement | Task |
|------------------|------|
| Web research instructions: do it / this / that / complete / not shell | Task 2 |
| Shared tools follow-up line when useTools | Task 2 + 4 |
| `skillOverrides` + `useTools` on chat/thread | Task 4–5 |
| Registry merge via extraIds | Task 3 |
| `chat:start` skillOverrides | Task 4 |
| ⚒ restore + persist every toggle | Task 5 |
| Chip Enable / Keep enabled / Dismiss | Task 5 |
| `hasHttpUrl` + visibility matrix | Task 1 |
| No invented tool calls from confirmation | Global constraint; no executor task |
| Non-goals (XML, other skills, silent auto-on) | Omitted |

**Placeholder scan:** none.  
**Type consistency:** `skillOverrides: string[]`, `SKILL_ID = "web-research"`, helpers take `extraIds?: string[]`.
