# Web Research Skill + Text Tool-Call Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a built-in Web research skill (`web_search` + `http_fetch` with instructions) and recover tool calls when the model pastes JSON in text instead of emitting Ollama `tool_calls`.

**Architecture:** A pure `recoverToolCalls(text, allowlist)` parser strips and maps JSON tool dumps into the existing agent-loop `tool_calls` shape. The chat loop in `ipc.ts` runs recovery only when tools are on and structured calls are empty. A new builtin skill `web-research` declares `toolNames` against the tools registry; `skills/registry.ts` gains the same opt-in path custom skills already use.

**Tech Stack:** Electron main process, TypeScript, Bun tests (`bun:test`), existing skills/tools registries.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-06-web-research-skill-tool-recovery-design.md`
- Recovery only when `toolDefs` is set and structured `toolCalls` is empty
- Allowlist = names in this turn’s `toolDefs` only; max 3 recovered calls
- Accepted JSON: `{ name, parameters }` or `{ name, arguments }`; strip matched blobs from reply text
- Risky tools still go through existing `confirm`
- Web research: id `web-research`, Off by default, no `connector`, `toolNames: ["web_search", "http_fetch"]`
- Extend `customToolNames()` for builtin `toolNames` (no rename)
- Do not change Ollama streaming; no XML recovery; no auto-enable ⚒
- Commit steps run only when the user explicitly asks to commit (user rule); otherwise skip commits and leave changes unstaged

## File map

| File | Responsibility |
|------|----------------|
| `app/src/main/tools/recover-tool-calls.ts` | Pure parser: text → `{ calls, cleanedText }` |
| `app/src/main/tools/recover-tool-calls.test.ts` | Parser unit tests |
| `app/src/main/ipc.ts` | Post-stream recovery before agent-loop break condition |
| `app/src/main/skills/builtins.ts` | Add `webResearch` builtin; export in `BUILTIN_SKILLS` |
| `app/src/main/skills/builtins.test.ts` | Shape tests for web-research |
| `app/src/main/skills/registry.ts` | `toolNames` on builtins in `list` / `ollamaTools` / `customToolNames` |
| `app/src/renderer/js/skills-view.ts` | Soften manager hint (connector vs all builtins) |

Paths below are relative to `app/` unless noted.

---

### Task 1: Recover tool calls from assistant text

**Files:**
- Create: `src/main/tools/recover-tool-calls.ts`
- Create: `src/main/tools/recover-tool-calls.test.ts`

**Interfaces:**
- Produces:
  - `recoverToolCalls(text: string, allowedNames: Iterable<string>): { calls: OllamaToolCall[]; cleanedText: string }`
  - Each call: `{ function: { name: string; arguments: Record<string, string> } }`
  - Cap: first 3 valid calls in document order
  - Args: prefer `parameters` over `arguments` if both exist; coerce every value with `String(...)`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/main/tools/recover-tool-calls.test.ts
import { describe, expect, test } from "bun:test";
import { recoverToolCalls } from "./recover-tool-calls";

const allow = ["http_fetch", "web_search", "run_shell"];

describe("recoverToolCalls", () => {
  test("screenshot-style http_fetch with parameters in a fence", () => {
    const text =
      `Based on the available functions, we can call the fetch tool:\n\n` +
      "```json\n" +
      `{"name": "http_fetch", "parameters": {"url": "https://yasharyan.dev", "method": "GET"}}\n` +
      "```\n";
    const { calls, cleanedText } = recoverToolCalls(text, allow);
    expect(calls).toEqual([
      {
        function: {
          name: "http_fetch",
          arguments: { url: "https://yasharyan.dev", method: "GET" },
        },
      },
    ]);
    expect(cleanedText).not.toContain('"name": "http_fetch"');
    expect(cleanedText).not.toContain("```");
    expect(cleanedText).toContain("Based on the available functions");
  });

  test("arguments key also works", () => {
    const text = `{"name": "http_fetch", "arguments": {"url": "https://example.com"}}`;
    const { calls, cleanedText } = recoverToolCalls(text, allow);
    expect(calls).toHaveLength(1);
    expect(calls[0].function?.name).toBe("http_fetch");
    expect(calls[0].function?.arguments).toEqual({ url: "https://example.com" });
    expect(cleanedText.trim()).toBe("");
  });

  test("unknown name ignored; text unchanged", () => {
    const text = `{"name": "not_a_tool", "parameters": {"x": "1"}}`;
    const { calls, cleanedText } = recoverToolCalls(text, allow);
    expect(calls).toEqual([]);
    expect(cleanedText).toBe(text);
  });

  test("non-tool JSON ignored", () => {
    const text = `Here is data: {"foo": 1, "bar": 2}`;
    const { calls, cleanedText } = recoverToolCalls(text, allow);
    expect(calls).toEqual([]);
    expect(cleanedText).toBe(text);
  });

  test("two valid objects; order preserved; cap at 3", () => {
    const text =
      `{"name":"web_search","parameters":{"query":"a"}}\n` +
      `{"name":"http_fetch","parameters":{"url":"https://a"}}\n` +
      `{"name":"web_search","parameters":{"query":"b"}}\n` +
      `{"name":"web_search","parameters":{"query":"c"}}`;
    const { calls } = recoverToolCalls(text, allow);
    expect(calls).toHaveLength(3);
    expect(calls.map((c) => c.function?.arguments?.query ?? c.function?.arguments?.url)).toEqual([
      "a",
      "https://a",
      "b",
    ]);
  });

  test("name not in allowlist skipped even if JSON valid", () => {
    const text = `{"name":"run_shell","parameters":{"command":"doit"}}`;
    const { calls, cleanedText } = recoverToolCalls(text, ["http_fetch"]);
    expect(calls).toEqual([]);
    expect(cleanedText).toBe(text);
  });

  test("coerces non-string arg values to strings", () => {
    const text = `{"name":"http_fetch","parameters":{"url":"https://x","method":"GET"}}`;
    // Also cover numeric-looking via JSON number:
    const text2 = `{"name":"web_search","parameters":{"query":123}}`;
    expect(recoverToolCalls(text2, allow).calls[0].function?.arguments?.query).toBe("123");
    expect(recoverToolCalls(text, allow).calls[0].function?.arguments?.method).toBe("GET");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `app/`):

```bash
bun test src/main/tools/recover-tool-calls.test.ts
```

Expected: FAIL (module or export missing).

- [ ] **Step 3: Implement the parser**

```typescript
// src/main/tools/recover-tool-calls.ts
// Recover tool calls when the model pastes JSON instead of emitting tool_calls.

const MAX_CALLS = 3;

type Recovered = {
  calls: OllamaToolCall[];
  cleanedText: string;
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function coerceArgs(obj: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v == null) continue;
    out[k] = typeof v === "string" ? v : String(v);
  }
  return out;
}

function tryParseTool(obj: unknown, allow: Set<string>): OllamaToolCall | null {
  if (!isPlainObject(obj)) return null;
  const name = obj.name;
  if (typeof name !== "string" || !allow.has(name)) return null;
  const raw = obj.parameters !== undefined ? obj.parameters : obj.arguments;
  if (!isPlainObject(raw)) return null;
  return { function: { name, arguments: coerceArgs(raw) } };
}

// Find JSON object spans by brace matching; also detect ``` / ```json fences.
function recoverToolCalls(text: string, allowedNames: Iterable<string>): Recovered {
  const allow = new Set(allowedNames);
  const src = String(text ?? "");
  const calls: OllamaToolCall[] = [];
  // Collect removable ranges [start, end) in reverse for safe splicing later
  type Range = { start: number; end: number };
  const ranges: Range[] = [];

  const fenceRe = /```(?:json)?\s*\n?([\s\S]*?)```/gi;
  let m: RegExpExecArray | null;
  const fenceSpans: { start: number; end: number; inner: string; innerStart: number }[] = [];
  while ((m = fenceRe.exec(src))) {
    fenceSpans.push({
      start: m.index,
      end: m.index + m[0].length,
      inner: m[1],
      innerStart: m.index + m[0].indexOf(m[1]),
    });
  }

  function consider(jsonText: string, absStart: number, absEnd: number, fence?: Range) {
    if (calls.length >= MAX_CALLS) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText.trim());
    } catch {
      return;
    }
    const call = tryParseTool(parsed, allow);
    if (!call) return;
    calls.push(call);
    ranges.push(fence ?? { start: absStart, end: absEnd });
  }

  // 1) Fenced blocks that are a single tool JSON object
  for (const f of fenceSpans) {
    if (calls.length >= MAX_CALLS) break;
    consider(f.inner, f.start, f.end, { start: f.start, end: f.end });
  }

  // 2) Bare JSON objects via brace scan (skip ranges already inside kept fences… 
  //    simpler: scan whole string; skip if overlapping an already-accepted range)
  let i = 0;
  while (i < src.length && calls.length < MAX_CALLS) {
    if (src[i] !== "{") {
      i++;
      continue;
    }
    let depth = 0;
    let j = i;
    let inStr = false;
    let esc = false;
    for (; j < src.length; j++) {
      const ch = src[j];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === "\\") esc = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') inStr = true;
      else if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          j++;
          break;
        }
      }
    }
    if (depth !== 0) break;
    const overlaps = ranges.some((r) => i < r.end && j > r.start);
    if (!overlaps) consider(src.slice(i, j), i, j);
    i = Math.max(j, i + 1);
  }

  // Sort ranges and splice from end
  ranges.sort((a, b) => b.start - a.start);
  let cleaned = src;
  for (const r of ranges) {
    cleaned = cleaned.slice(0, r.start) + cleaned.slice(r.end);
  }
  cleaned = cleaned.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

  return { calls, cleanedText: cleaned };
}

export { recoverToolCalls };
```

Implementation notes for the engineer:
- Prefer a working brace-scanner; if fence + bare double-match the same object, `overlaps` must prevent duplicate calls and duplicate range removal.
- When a fence’s inner parse succeeds, remove the **entire fence** (including backticks).
- `OllamaToolCall` is ambient from `src/types/domain.d.ts` (same as other main files).

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun test src/main/tools/recover-tool-calls.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit (only if user asked)**

```bash
git add src/main/tools/recover-tool-calls.ts src/main/tools/recover-tool-calls.test.ts
git commit -m "$(cat <<'EOF'
feat: recover tool calls pasted as JSON in model text

EOF
)"
```

---

### Task 2: Wire recovery into the chat agent loop

**Files:**
- Modify: `src/main/ipc.ts` (after `chatStream` returns, before the `if (!toolDefs || !calls.length || rounds >= 15) break` check — today around the `const calls = result.toolCalls || [];` block)

**Interfaces:**
- Consumes: `recoverToolCalls(text, allowedNames)` from Task 1
- Produces: agent loop treats recovered calls like native `toolCalls`; `result.text` replaced with `cleanedText` when recovery hits

- [ ] **Step 1: Add import**

Near other tool imports at top of `ipc.ts`:

```typescript
import { recoverToolCalls } from "./tools/recover-tool-calls";
```

- [ ] **Step 2: Insert recovery after stream result**

Replace the block that currently looks like:

```typescript
const calls = result.toolCalls || [];
// Folder organizing / coding tasks need more tool rounds than Q&A.
if (!toolDefs || !calls.length || rounds >= 15) break;
```

with:

```typescript
let calls = result.toolCalls || [];
// Small models often paste tool JSON in the reply instead of emitting
// structured tool_calls — recover those so http_fetch / etc. actually run.
if (toolDefs && !calls.length && result.text) {
  const allowed = toolDefs.map((d) => d.function.name);
  const recovered = recoverToolCalls(result.text, allowed);
  if (recovered.calls.length) {
    calls = recovered.calls;
    result = { ...result, text: recovered.cleanedText };
  }
}
// Folder organizing / coding tasks need more tool rounds than Q&A.
if (!toolDefs || !calls.length || rounds >= 15) break;
```

Do **not** recover when `calls.length > 0` (structured wins).

- [ ] **Step 3: Typecheck**

```bash
bun run typecheck
```

Expected: PASS (no new errors in `ipc.ts`).

- [ ] **Step 4: Manual smoke (optional but recommended)**

1. `bun run start` (from `app/`)
2. Enable ⚒, send a prompt that yields pasted JSON (or temporarily stub — if hard to force, skip and rely on Task 1 tests + code review)
3. Confirm Progress shows the tool and the reply continues after tool results

- [ ] **Step 5: Commit (only if user asked)**

```bash
git add src/main/ipc.ts
git commit -m "$(cat <<'EOF'
feat: run recovered text tool calls in the chat agent loop

EOF
)"
```

---

### Task 3: Web research builtin skill + registry `toolNames`

**Files:**
- Modify: `src/main/skills/builtins.ts`
- Modify: `src/main/skills/registry.ts`
- Create: `src/main/skills/builtins.test.ts`
- Modify: `src/renderer/js/skills-view.ts` (hint copy only)

**Interfaces:**
- Consumes: `toolsRegistry.get` / `toOllama` (existing)
- Produces:
  - Builtin `{ id: "web-research", name: "Web research", … toolNames: ["web_search", "http_fetch"], tools: [] }`
  - `list()` exposes `toolNames` for builtins
  - `ollamaTools()` emits registry defs for builtin `toolNames`
  - `customToolNames()` includes enabled builtins’ `toolNames`

- [ ] **Step 1: Write failing shape tests**

```typescript
// src/main/skills/builtins.test.ts
import { describe, expect, test } from "bun:test";
import { BUILTIN_SKILLS } from "./builtins";

describe("BUILTIN_SKILLS", () => {
  test("includes web-research without connector", () => {
    const s = BUILTIN_SKILLS.find((x) => x.id === "web-research");
    expect(s).toBeTruthy();
    expect(s!.name).toBe("Web research");
    expect((s as { connector?: string }).connector).toBeUndefined();
    expect(s!.toolNames).toEqual(["web_search", "http_fetch"]);
    expect(s!.tools).toEqual([]);
    expect(s!.instructions).toMatch(/http_fetch/);
    expect(s!.instructions).toMatch(/web_search/);
    expect(s!.instructions.toLowerCase()).toMatch(/do it|go ahead/);
    expect(s!.instructions.toLowerCase()).toMatch(/json|example/);
  });

  test("calendar and outlook unchanged connectors", () => {
    expect(BUILTIN_SKILLS.find((x) => x.id === "google-calendar")?.connector).toBe(
      "google-calendar"
    );
    expect(BUILTIN_SKILLS.find((x) => x.id === "outlook")?.connector).toBe("outlook");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test src/main/skills/builtins.test.ts
```

Expected: FAIL (no `web-research`).

- [ ] **Step 3: Add the builtin**

In `src/main/skills/builtins.ts`, before `export const BUILTIN_SKILLS = ...`, add:

```typescript
const webResearch = {
  id: "web-research",
  name: "Web research",
  builtin: true,
  description:
    "Search the web and fetch page contents when answering about live URLs or current facts.",
  instructions:
    "You can search the web with web_search and read pages with http_fetch. " +
    "For live URLs or current facts: call web_search and/or http_fetch — do not invent page contents. " +
    "Never paste example JSON or pretend a tool ran; use the tool-calling interface. " +
    "If the user says \"do it\", \"go ahead\", or similar after you proposed a tool, call that tool " +
    "(usually http_fetch or web_search) — do not treat their message as a shell command.",
  tools: [] as [],
  toolNames: ["web_search", "http_fetch"],
};
```

Update export:

```typescript
export const BUILTIN_SKILLS = [webResearch, googleCalendar, outlook];
```

(Put Web research first so it appears above Calendar in the rail.)

- [ ] **Step 4: Extend `registry.ts`**

In `list()`, change the builtins map so `toolNames` comes from the skill:

```typescript
const builtins = BUILTIN_SKILLS.map((s) => ({
  id: s.id,
  name: s.name,
  description: s.description,
  connector: s.connector || null,
  builtin: true,
  enabled: store.enabledBuiltins ? store.enabledBuiltins.includes(s.id) : false,
  toolNames:
    Array.isArray((s as { toolNames?: string[] }).toolNames) &&
    (s as { toolNames?: string[] }).toolNames!.length
      ? (s as { toolNames: string[] }).toolNames
      : (s.tools || []).map((t) => t.name),
}));
```

In `ollamaTools()`, inside the `if (s.builtin)` branch:

```typescript
if (s.builtin) {
  const full = builtinSkill(s.id);
  const names = (full as { toolNames?: string[] })?.toolNames;
  if (names && names.length) {
    for (const name of names) {
      const t = toolsRegistry.get(name);
      if (t && !seen.has(t.name)) {
        seen.add(t.name);
        defs.push(toOllama(t));
      }
    }
  } else {
    for (const t of full.tools) {
      if (!seen.has(t.name)) {
        seen.add(t.name);
        defs.push(toOllama(t));
      }
    }
  }
} else {
  // existing custom path unchanged
}
```

In `customToolNames()`:

```typescript
function customToolNames() {
  const names = new Set<string>();
  for (const s of enabledSkills()) {
    if (s.builtin) {
      const full = builtinSkill(s.id);
      const tn = (full as { toolNames?: string[] })?.toolNames;
      if (tn) for (const n of tn) names.add(n);
    } else {
      for (const n of s.toolNames || []) names.add(n);
    }
  }
  return names;
}
```

- [ ] **Step 5: Soften Skills manager hint**

In `src/renderer/js/skills-view.ts`, change the hint string to:

```typescript
"A skill bundles instructions and tools the model gets when the ⚒ toggle is on in a chat. " +
  "Connector skills (Calendar, Outlook) need their account connected first. Write actions always ask before running."
```

- [ ] **Step 6: Run tests + typecheck**

```bash
bun test src/main/skills/builtins.test.ts src/main/tools/recover-tool-calls.test.ts
bun run typecheck
```

Expected: PASS.

- [ ] **Step 7: Manual UI check**

1. Start the app; open Skills rail — **Web research** appears with Off; no Connect button.
2. Toggle On; with ⚒ on, start a chat about a URL — system prompt should include the skill block (confirm via behavior: model more likely to call tools).
3. Calendar/Outlook still show Connect when not connected.

- [ ] **Step 8: Commit (only if user asked)**

```bash
git add src/main/skills/builtins.ts src/main/skills/builtins.test.ts src/main/skills/registry.ts src/renderer/js/skills-view.ts
git commit -m "$(cat <<'EOF'
feat: add Web research skill with registry toolNames support

EOF
)"
```

---

### Task 4: Spec coverage smoke checklist

**Files:** none new (verification only)

- [ ] **Step 1: Run full relevant tests**

```bash
cd app && bun test src/main/tools/recover-tool-calls.test.ts src/main/skills/builtins.test.ts
bun run typecheck
```

Expected: all PASS.

- [ ] **Step 2: Confirm success criteria from the spec**

| Criterion | How to verify |
|-----------|----------------|
| Skills rail shows Web research; On injects instructions when ⚒ on | Manual Task 3 Step 7 |
| Pasted `http_fetch` JSON runs a real fetch | Task 1 tests + Task 2 wiring; optional live replay |
| Risky recovered calls still confirm | Allowlist includes `run_shell` only if offered; confirm path unchanged — spot-check code review of Task 2 |
| Calendar/Outlook unchanged | `builtins.test.ts` connector assertions |

- [ ] **Step 3: Commit plan/spec only if user asked**

Include `docs/superpowers/specs/2026-08-06-web-research-skill-tool-recovery-design.md` and this plan if committing docs.

---

## Spec coverage (self-review)

| Spec requirement | Task |
|------------------|------|
| Web research builtin, no connector, Off by default | Task 3 |
| `toolNames: web_search, http_fetch` | Task 3 |
| Instructions intent (call tools, no fake JSON, “do it”) | Task 3 |
| `list` / `ollamaTools` / `customToolNames` for builtin toolNames | Task 3 |
| Soften Skills hint | Task 3 |
| Post-stream recovery when no structured calls | Task 1–2 |
| parameters/arguments JSON, allowlist, cap 3, clean text | Task 1 |
| Risky confirm unchanged | Task 2 (no confirm changes) |
| Tests table | Task 1 + Task 3 + Task 4 |

No XML recovery, no auto ⚒ — omitted by design.
