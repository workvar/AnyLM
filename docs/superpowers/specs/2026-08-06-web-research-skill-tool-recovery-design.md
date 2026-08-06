# Web research skill + text tool-call recovery

**Date:** 2026-08-06  
**Status:** Approved  
**Approach:** Built-in Web research skill + post-stream JSON recovery (approach 1)  
**Surfaces:** `app/src/main/skills/builtins.ts`, `app/src/main/skills/registry.ts`, `app/src/main/ipc.ts` (agent loop), new parser module under `app/src/main/tools/`, tests, Skills rail/manager (no Connect UI)

## Problem

With tools enabled, small models (e.g. `llama3.1:8b`) often **describe** a tool call in the assistant reply as JSON instead of emitting Ollama structured `tool_calls`. AnyLM only executes structured calls, so `http_fetch` never runs. Follow-ups like “Do it” can be misread as `run_shell`. Users also expect a Skills-rail toggle for web/browse behavior; today only Calendar/Outlook appear there, while `web_search` / `http_fetch` live only under Tools.

## Decisions (locked)

| Topic | Choice |
|-------|--------|
| Skill | Built-in **Web research** (no OAuth) |
| Default | Off until the user enables it (same as other builtins) |
| Tools | Reference registry `web_search` + `http_fetch` (no duplicates) |
| Skill opt-in | Enabling the skill opts those tools in even if globally disabled (custom-skill pattern) |
| Recovery | Post-stream text parse when structured `tool_calls` is empty |
| Formats | JSON with `name` + `parameters` or `arguments` |
| Safety | Only names offered in this turn’s `toolDefs`; existing risky confirm path |
| Cap | First 3 recovered calls per stream |
| Visible reply | Strip recovered JSON blobs from assistant text before / while continuing the agent loop |

## Goals

1. Show **Web research** in the Skills rail/manager with On/Off (no Connect).
2. When the skill is on and ⚒ is on, inject instructions that push real tool use over pasted examples / invented page content.
3. Recover explicit text JSON tool invocations into the normal execute → tool-result → continue loop.
4. Keep risky tools (`run_shell`, etc.) behind the existing confirm UI even when recovered from text.

## Non-goals

- Changing Ollama streaming or native `tool_calls` parsing.
- Auto-enabling the ⚒ composer toggle.
- Recovering vague prose without a parseable JSON object.
- Aggressive XML / `<tool_call>` / free-form scrapers in v1.
- Duplicating `web_search` / `http_fetch` implementations inside the skill.
- Making Web research require auth-backend connectors.

---

## 1. Web research skill

Add a built-in skill alongside Google Calendar and Outlook.

### Shape

| Field | Value |
|-------|--------|
| `id` | `web-research` |
| `name` | `Web research` |
| `description` | Search the web and fetch page contents when answering about live URLs or current facts. |
| `connector` | omitted / `null` (no Connect button) |
| Tools | Registry names: `web_search`, `http_fetch` |

### Instructions (intent)

When this skill is enabled, system prompt should tell the model to:

- Use `web_search` for discovery, then `http_fetch` to read a page.
- **Call** tools via the tool interface; never paste example JSON or pretend a fetch ran.
- Not invent site contents; if a fetch fails, say so.
- Treat user follow-ups like “do it” / “go ahead” as “run the tool you just proposed,” not as a shell command.

Exact copy can be tightened in implementation; intent above is normative.

### Builtin object shape

```ts
{
  id: "web-research",
  name: "Web research",
  builtin: true,
  // no `connector` field
  description: "...",
  instructions: "...", // full prompt copy written at implement time; must cover intent above
  tools: [],           // no connector-owned tools
  toolNames: ["web_search", "http_fetch"], // registry references
}
```

Calendar/Outlook keep `tools: [...]` and omit `toolNames`.

### Registry changes

Today builtins only carry inline `tools[]` with `run()`. Custom skills use `toolNames` against the tools registry.

Extend builtin handling so a skill may declare **`toolNames`** referencing the global tools registry:

- `list()` — expose `toolNames` for builtins as `s.toolNames` if set, else `s.tools.map(t => t.name)`.
- `instructionsBlock()` — unchanged (include when skill enabled).
- `ollamaTools()` — if builtin has non-empty `toolNames`, emit defs from `toolsRegistry.get(name)` (same as custom skills); else keep current connector `tools[]` path.
- Opt-in allowlist — **extend** existing `customToolNames()` so it also returns `toolNames` from enabled builtins (no rename in v1; same IPC/`skillToolAllow` consumers).

Skills UI already skips Connect when `!s.connector`; rail panel lists all builtins — no Connect UI required.

Softening Skills manager hint: change “Built-in skills need their account connected first” to something like “Connector skills (Calendar, Outlook) need their account connected first.”

---

## 2. Text tool-call recovery

### When

After `ollama.chatStream` returns, if:

1. `toolDefs` is non-null (⚒ / tools on for this turn), and  
2. `result.toolCalls` is empty, and  
3. assistant `result.text` contains recoverable JSON,

then treat recovered calls as `toolCalls` and continue the existing agent loop (do not break early as “no tools”).

If structured `tool_calls` is non-empty, **do not** also recover from text (avoid double-running).

### Parser

New focused module (e.g. `app/src/main/tools/recover-tool-calls.ts`):

**Input:** assistant text, `Set`/`array` of allowed tool names.  
**Output:** `{ calls: Ollama-shaped tool_calls[], cleanedText: string }`.

**Accepted shapes** (object may appear in a fenced ```json block or bare in the prose):

```json
{"name": "http_fetch", "parameters": {"url": "https://example.com", "method": "GET"}}
```

```json
{"name": "http_fetch", "arguments": {"url": "https://example.com"}}
```

Rules:

- `name` must be a string in the allowlist for this turn.
- `parameters` / `arguments` must be a plain object (string values coerced as today’s executors expect strings).
- Scan in document order; keep at most **3** calls.
- Ignore JSON that is not a tool invocation (no `name`, unknown name, non-object args).
- Remove matched JSON (and surrounding fence if it only wrapped that object) from `cleanedText` so the user does not keep a dead example blob as the “answer” before the next round.
- If cleaning leaves empty/whitespace-only text, use `""` for the assistant message content in the tool round.

Map each hit to the same shape the agent loop already uses:

```ts
{ function: { name: string, arguments: Record<string, unknown> } }
```

### Agent loop integration (`ipc.ts`)

Pseudo-flow:

```
calls = result.toolCalls || []
if (toolDefs && !calls.length) {
  recovered = recoverToolCalls(result.text, allowedNamesFrom(toolDefs))
  if (recovered.calls.length) {
    calls = recovered.calls
    result = { ...result, text: recovered.cleanedText }
  }
}
if (!toolDefs || !calls.length || rounds >= 15) break
// existing execute path unchanged (skillsExec / toolsExec / confirm)
```

Activity events should show recovered tools the same as native ones (no special “recovered” UI required for v1).

### Safety

- Allowlist = names present in this turn’s `toolDefs` only.
- `run_shell` / other `risky` tools still hit `confirm` when recovered.
- No automatic approval.
- Cap 3 calls per recovery pass; existing `rounds >= 15` still bounds the outer loop.

---

## 3. Tests

| Case | Expect |
|------|--------|
| Screenshot-style `http_fetch` + `parameters` in a fence | One call; cleaned text without the JSON |
| Same with `arguments` | One call |
| Unknown `name` | No calls; text unchanged |
| Structured `tool_calls` already present | Recovery not invoked / not merged |
| Two valid objects in one reply | Up to 2 calls (order preserved), ≤ 3 |
| Non-tool JSON object | Ignored |
| Skill list includes `web-research` builtin without connector | Present; toggle persists via `enabledBuiltins` |

---

## 4. Out of scope follow-ups

- XML / vendor-specific tool markup recovery.
- Heuristics for “Do it” without any JSON (prompt/skill instructions only).
- Auto-suggest enabling Web research when the user pastes a URL.

---

## Success criteria

1. Skills rail shows **Web research**; turning it On injects instructions when ⚒ is on.
2. Replaying the screenshot failure mode (model pastes `http_fetch` JSON, no structured calls) results in a real fetch appearing in Progress and a follow-up model turn with tool results.
3. Risky recovered calls still require Allow/Deny.
4. Existing Calendar/Outlook connector skills unchanged.
