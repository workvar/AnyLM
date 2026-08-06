# Web research follow-ups: confirm heuristics + URL skill nudge

**Date:** 2026-08-06  
**Status:** Approved  
**Approach:** Persist per-conversation skill overrides (approach 2) + prompt-only confirm heuristics  
**Depends on:** `docs/superpowers/specs/2026-08-06-web-research-skill-tool-recovery-design.md` (Web research skill + text tool-call recovery)  
**Surfaces:** skill instructions, shared tools system prompt, `StandaloneChat` / `ProjectThread` fields, `chat:start` payload, skills registry merge helpers, composer chip UI, tests

## Problem

1. After the model *proposes* a tool (often `http_fetch`) without emitting structured calls or recoverable JSON, users say **“Do it”**, **“this”**, **“that”**, or **“complete”**. Small models may treat that as a new task or as `run_shell` instead of running the proposed tool.
2. Users paste a live URL while **Web research** is off and never discover the skill; they expect a nudge, not silent failure or invented page content.

JSON recovery (already shipped) does not cover confirmation-only follow-ups. Auto-enabling the skill with no consent is too aggressive.

## Decisions (locked)

| Topic | Choice |
|-------|--------|
| Confirm / anaphora | **Prompt only** — no code that invents tool calls from “Do it” |
| Scope of confirm prompt | Web research skill copy **plus** a short **shared** tools system line (any proposed tool) |
| URL paste UX | Soft chip: **Enable** · **Keep enabled** · Dismiss (option B + C) |
| Enable | This conversation only — persist on chat/thread |
| Keep enabled | Flip global Skills rail On; drop per-conversation override for that skill |
| ⚒ | Enable / Keep enabled also turn tools on for this conversation and persist `useTools` |
| Dismiss | Hide until URL leaves the input or conversation switches (no persisted dismiss list in v1) |
| Persistence | `skillOverrides` (+ `useTools`) on `StandaloneChat` and `ProjectThread` |

## Goals

1. Teach the model that short confirmations and deixis (“do it”, “go ahead”, “this”, “that”, “complete”) mean **run the tool just proposed**, not shell or unrelated work.
2. When the composer contains an `http(s)` URL and Web research is not active for this conversation, show a one-shot enable path.
3. Survive reopen of the same chat/thread via persisted overrides.
4. Keep risky-tool confirm UI unchanged; never auto-approve.

## Non-goals

- Inventing tool calls from confirmation text with no prior proposal and no JSON.
- Auto-enable ⚒ or Web research with no user click (except as part of Enable / Keep enabled).
- XML / free-form tool markup recovery.
- Nudges for Calendar, Outlook, or other skills in v1.
- Copying `skillOverrides` into compact / seeded new chats by default.

---

## 1. Prompt pack

### 1a. Web research skill instructions

Extend `web-research` `instructions` so that when this skill is active (globally or via override):

- Prefer calling `web_search` / `http_fetch` over inventing page contents.
- Never paste example JSON; use the tool interface (existing).
- If the user confirms with phrases like **do it**, **go ahead**, **yes**, **fetch it**, or refers to a prior URL/proposal with **this**, **that**, **the link**, **complete**, **finish it** — call the proposed `http_fetch` / `web_search` (with the URL or query from context).
- Do **not** interpret those confirmations as `run_shell` or as a new unrelated task.

Exact string is implementation detail; the bullets above are normative.

### 1b. Shared tools follow-up line

When `useTools` is true for a turn, append a short system block (independent of which skills are on), e.g. intent:

> If you proposed a tool and the user replies with a short confirmation or reference (do it, go ahead, this, that, complete it, etc.), call that tool with the arguments implied by the prior turn. Do not treat the confirmation as a shell command unless they clearly asked to run a shell command.

No runtime parsing of user text into tool calls.

---

## 2. Per-conversation skill overrides

### Data

Add optional fields (absent = empty / false):

```ts
// StandaloneChat & ProjectThread
skillOverrides?: string[]; // e.g. ["web-research"]
useTools?: boolean;        // last-known ⚒ for this conversation
```

Existing `updateChat` / `updateThread` patches already merge arbitrary fields — no migration file; old records simply lack the keys.

### Effective skills for a turn

```
effectiveSkillIds = globalEnabledSkillIds ∪ (skillOverrides || [])
```

Registry helpers gain an optional `extraIds: string[]` (or equivalent):

- `instructionsBlock(extraIds?)`
- `ollamaTools(extraIds?)`
- `customToolNames(extraIds?)`

Behavior: include a builtin/custom skill if it is globally enabled **or** its id is in `extraIds`. Global toggle and Skills UI unchanged.

### `chat:start` payload

```ts
useTools?: boolean;
skillOverrides?: string[];
```

Renderer sends `skillOverrides` from the open chat/thread. Main uses them only when `useTools` is true (same gate as today’s skill injection).

### ⚒ restore and persist

On `selectChat` / open thread: set composer ⚒ from persisted `useTools` (default false if missing).

Whenever the user toggles ⚒ in the composer (including Enable / Keep enabled), patch the open chat/thread with the new `useTools` value so reopen matches the last choice.

---

## 3. URL nudge UI

### Trigger

Pure helper `hasHttpUrl(text)`: true if text contains an `http://` or `https://` URL with a plausible host (implementation may use a conservative regex).

Listen on `#chat-input` for `input` and `paste`.

Show the chip when:

1. `hasHttpUrl(input.value)`, and  
2. Web research is **not** in the global enabled builtins list, and  
3. `"web-research"` is **not** already in this conversation’s `skillOverrides`.

Hide when any of those fail, on Dismiss, after Enable/Keep enabled, or when switching conversation.

### Chip

Place near the composer (above `#attach-chips` or adjacent strip). Copy (approx):

> This looks like a link — enable Web research?

Actions:

| Action | Behavior |
|--------|----------|
| **Enable** | Patch chat/thread: add `web-research` to `skillOverrides`, set `useTools: true`. Set local ⚒ on. Hide chip. |
| **Keep enabled** | `skillsToggle("web-research", true)`. Remove `web-research` from this conversation’s `skillOverrides`. Set `useTools: true` + local ⚒ on. Hide chip. |
| **Dismiss (✕)** | Hide until URL leaves the input or conversation changes. Do not persist dismiss in v1. |

Multiple URLs in one paste → still one chip.

---

## 4. Agent loop

Unchanged aside from:

- Merging `skillOverrides` into skill instructions / tool defs / allowlist.
- Injecting the shared follow-up prompt when tools are on.

Text JSON recovery and risky confirm paths stay as in the parent spec.

---

## 5. Tests

| Case | Expect |
|------|--------|
| `hasHttpUrl` with bare `https://example.com` | true |
| `hasHttpUrl` without scheme / no URL | false |
| Registry: global off + extra `web-research` | instructions + `web_search`/`http_fetch` defs present |
| Registry: global on + empty extra | same as today |
| Web research instructions | match do it / go ahead / this\|that\|complete; discourage shell-as-confirmation |
| Chip visibility helper | URL × global × override matrix |
| Shared follow-up block | included in tools-on system assembly (extract builder or assert string helper) |

---

## 6. Success criteria

1. Paste a URL with Web research off → chip appears; **Enable** lets the next ⚒ turn use the skill without flipping the Skills rail; reopen still has the override.
2. **Keep enabled** turns the rail On and clears the per-chat override for that skill.
3. After the model proposes a fetch, user “Do it” / “fetch this” / “complete” is steered by prompts toward calling the tool (not `run_shell`); no new auto-executor for bare confirmations.
4. Calendar/Outlook and JSON recovery behavior unchanged.

---

## Relationship to parent spec

Parent “Out of scope follow-ups” items covered here:

- Heuristics for “Do it” without any JSON (prompt/skill instructions only) — **in scope**, plus shared tools line.
- Auto-suggest enabling Web research when the user pastes a URL — **in scope** (suggest + Enable / Keep enabled, not silent auto-on).
- Chat context deixis (“this”, “that”, “complete”) — **in scope** via prompts only.
