# Multi-agent Phase 2 — Knowledge specialists

**Date:** 2026-08-10  
**Status:** Approved (design)  
**Approach:** Extend Phase 1 orchestrator graph with first-class Knowledge step kinds (approach 1)  
**Surfaces:** `app/src/main/agents/` (types, complexity, planner, router, workers, settings), Settings → Agents UI, existing activity / agent trail  
**Depends on:** `docs/superpowers/specs/2026-08-07-multi-agent-core-design.md` (Phase 1 — shipped)

## Problem

Phase 1 can plan and run `memory` / `retrieve` / `tool` / `synthesize` in parallel, but it has no Knowledge specialists. Research, verification, summarization, and document writing still collapse into generic tool or synthesize steps, so the trail does not name those roles and the planner is not biased toward the right tool loops.

Users (and the marketing “Research specialist / Coming soon” catalog) expect Phase 2 Knowledge agents next.

## Decisions (locked)

| Topic | Choice |
|-------|--------|
| Scope | All four Knowledge agents in one ship: Research, Fact Checker, Summarizer, Document Writer |
| Integration | First-class `AgentStepKind` values on the Phase 1 graph (not a separate subgraph, not skills-only) |
| Activation | Preferential: research / verify / summarize / write-doc intents lean `complex` and bias the planner toward Knowledge kinds |
| Fact Checker | Soft default: after `research`, insert `fact_check` when missing (unless fetch-only or step cap would be exceeded) |
| Models | Optional per-role model selects; unset → chat model (Research/Document may fall back to `toolExecutor` then chat) |
| UI | Reuse expandable agent trail; new `stepKind` labels only — no swarm panel |
| Coding coexistence | Project-first coding path wins when coding intent + tools on; do not dual-run Knowledge multi-agent |

## Goals

1. Planner/router can emit and run `research`, `fact_check`, `summarize`, and `document` steps.
2. Preferential Knowledge turns enter multi-agent without forcing it on every message.
3. Soft-default Fact Checker after Research; synthesize surfaces disputes when present.
4. Specialists reuse existing tools, confirms, document generation, load-guard, and activity trail.
5. Settings expose optional models for the four new roles.

## Non-goals

- Phase 3–5 agents (Coder, Debugger, Vision, etc.).
- Auto-retry research loops when Fact Checker disputes claims.
- Separate multi-agent / swarm UI.
- Cloud API backends.
- Changing project-first coding, load-protection thresholds, or single-agent tool loop semantics beyond orchestration wiring.

## Deferred agent catalog (unchanged)

| Phase | Agents |
| --- | --- |
| 3 — Code | Coder, Debugger, Tester, Reviewer, Critic |
| 4 — Domain | Math, Data Analyst, Scheduler, Notification |
| 5 — Modalities | Vision, Voice |

---

## 1. Architecture

Keep Phase 1 as the multi-agent path. Phase 2 extends the same graph:

```
chat:send
  → agents enabled?
      no → single-agent (or project-first if coding gate matches)
  → coding intent && tools? → project-first path (wins over Knowledge preferential)
  → complexity (+ preferential Knowledge heuristics)
      simple     → single-agent
      complex    → orchestrated turn
      ambiguous  → Router classify (unchanged)
  → planTurn (prompt knows 8 kinds; preferential bias when applicable)
  → assignKinds
  → soft-insert fact_check after research (cap-aware)
  → waves of workers (≤ maxParallel, load-guard unchanged)
  → synthesize → final reply
```

**Step kinds**

| Kept (Phase 1) | New (Phase 2) |
|----------------|---------------|
| `memory`, `retrieve`, `tool`, `synthesize` | `research`, `fact_check`, `summarize`, `document` |

Orchestrator lifecycle, scheduler, cancel, and `beforeWave` load-guard hooks stay as today. Only kind union, planning/routing, workers dispatch, and settings grow.

---

## 2. Components & contracts

| Unit | Responsibility |
|------|----------------|
| `types.ts` | Extend `AgentStepKind`, `AgentRole`, `AgentModelMap` |
| `complexity.ts` | Preferential heuristics → lean `complex` for Knowledge intents |
| `planner.ts` | Plan prompt lists all 8 kinds; bias copy when preferential |
| `router.ts` | Goal→kind patterns for the four new kinds + Phase 1 regression |
| `fact-check-insert.ts` (new) | Pure soft-insert of `fact_check` after `research` |
| `workers.ts` | Dispatch new kinds to specialist runners |
| `specialists/*.ts` (new) | Prompts + tool allowlists per kind |
| `settings.ts` + Settings UI | Four optional model selects |
| Activity trail | Existing `agent:step` / `agent:plan` with new `stepKind` labels |

### Preferential complexity (v1)

Strong signals (any → lean `complex` when agents enabled), examples:

- Research: “research”, “look up”, “find sources”, “what does the web say”, URLs + investigate language
- Fact-check: “verify”, “fact check”, “is this true”, “cross-check”
- Summarize: “summarize”, “TL;DR”, “brief me on”, “condense”
- Document: “write a PDF/DOCX/report/brief”, “generate a document”, “draft a memo”

Keep heuristics conservative so short conceptual Q&A stays simple/ambiguous. Preferential does not bypass the agents-disabled or project-first coding gates.

### Soft fact-check insert

After `assignKinds`:

1. For each step with `kind === "research"`, if no later step with `kind === "fact_check"` lists that research id in `dependsOn`, and the user text is not clearly fetch-only (e.g. “just fetch the page”, “download the URL only”), insert a new step:
   - `id`: unused id (e.g. `fc-<researchId>`)
   - `goal`: verify claims from that research step
   - `dependsOn`: `[researchId]`
   - `kind`: `fact_check`
2. If inserting would make `steps.length > 6`, skip the insert (do not drop planned steps).
3. Emit `agent:plan` only after insert so the trail matches execution.

### Specialist contracts

**research**

- Mini tool loop with specialist system prompt (“gather current facts with sources”).
- Tool allowlist: `web_search`, `http_fetch`, plus skill-owned equivalents already exposed to the turn.
- Model: `agents.models.research` → else `toolExecutor` → else chat model.
- Output: concise findings with source URLs/titles when available.

**fact_check**

- Primarily LLM over prior step outputs (research/tool); may optionally `http_fetch` disputed URLs only.
- Model: `agents.models.factCheck` → else chat model.
- Output: structured prose of supported / disputed / unknown claims (no mandatory JSON schema in v1).
- No automatic re-plan or second research wave when disputes appear.

**summarize**

- LLM-only compression of prior step outputs (and user ask); no file tools.
- Model: `agents.models.summarize` → else chat model.
- Output: short summary suitable for synthesize or user-facing brief.

**document**

- Mini tool loop focused on `generate_document` (plus light `web_search` / `http_fetch` / read if needed for content).
- Same confirm, content-quality, and file-card (`onFile`) path as today’s document generation.
- Model: `agents.models.document` → else `toolExecutor` → else chat model.
- Standalone vs project destination rules unchanged.

### Plan shape

Same `AgentStep` / `AgentPlan` as Phase 1; only `kind` union grows. Cap remains **at most 6 steps** including soft-inserted fact checks.

### Settings

Extend `AgentModelMap` / Settings → Agents with optional selects:

- Research, Fact check, Summarize, Document Writer  
- UI label “Same as chat” when empty  
- Resolve helpers: Research/Document fall back through `toolExecutor` then chat; Fact check/Summarize fall back to chat

`maxParallel`, load protection, and agents enabled toggle unchanged.

### Activity / UI

- Reuse `agent:plan`, `agent:step`, `agent:merge`.
- Trail labels for new kinds: “Research”, “Fact check”, “Summarize”, “Document”.
- Collapsed summary may count Knowledge steps the same way Phase 1 counts steps.

---

## 3. Data flow

1. Renderer `chat:send` → main (unchanged entry).
2. Agents disabled → single-agent (or other existing gates).
3. Project-first coding gate matches → coding path; skip Knowledge preferential multi-agent.
4. Complexity: preferential Knowledge → `complex`; else existing lean + optional classify.
5. Orchestrated turn: plan → assign kinds → soft fact-check insert → waves → synthesize.
6. Confirms/asks remain mutex-serialized across the turn.
7. Final assistant message is the synthesize result only (no streaming specialist dumps as the answer).

---

## 4. Error handling

| Case | Behavior |
|------|----------|
| Planner bad JSON / throws | Soft-fallback to single-agent (Phase 1) |
| Preferential misfire | Conservative heuristics; user can disable agents |
| `research` tools denied / offline | Step `ok: false` with short note; synthesize continues |
| Soft insert would exceed 6 steps | Skip insert; keep planned steps |
| `fact_check` finds disputes | Include in step output; synthesize prompt must surface uncertainty; no auto-retry research |
| `document` denied / quality guard fails | Same as current document path; step error in trail |
| User hits Stop | Cancel like Phase 1; no partial specialist chat dump |
| Load protection kill | Unchanged soft-stop + force `maxParallel` 1 |
| Coding + Knowledge both match | Coding path wins |

---

## 5. Testing

### Unit

- Preferential complexity positives/negatives
- Router kind assignment for four new kinds + Phase 1 regression
- Soft fact-check insert: after research; skip if present; skip fetch-only; skip at cap
- Specialist allowlist / prompt builders (pure)
- Settings resolve fallbacks for new roles

### Integration-style (no Electron)

- Orchestrator wave with mixed Phase 1 + Phase 2 kinds (mock `runStep`)
- Cancel mid-wave skips synthesize

### Manual / smoke

- “Research X and cite sources” → research (+ soft fact_check) → trail → one answer
- “Summarize these findings…” → summarize kind
- “Write a PDF brief on …” → document → file card
- Agents off → no Phase 2 path
- Coding scaffold prompt → project-first, not Knowledge multi-agent

### Success criteria

1. All four kinds appear in plans/trail when appropriate.
2. Soft fact-check follows research by default (when cap allows).
3. Preferential turns enter multi-agent without slowing trivial Q&A.
4. Tools, confirms, load-guard, and activity trail still apply.
5. Marketing “Research specialist” can be unmarked as Coming soon after ship.

---

## 6. Files (expected)

| Area | Paths |
|------|--------|
| Types / settings | `app/src/main/agents/types.ts`, `settings.ts`, `app/src/main/settings.ts` |
| Gate / plan / route | `complexity.ts`, `planner.ts`, `router.ts`, `fact-check-insert.ts` |
| Workers / specialists | `workers.ts`, `specialists/*.ts` |
| IPC wiring | `app/src/main/ipc.ts` (model resolve + preferential flag into planner if needed) |
| Settings UI | `app/src/renderer/index.html`, `js/settings.ts` |
| Trail labels | activity label helpers / renderer trail mapping as needed |
| Tests | `app/src/main/agents/*.test.ts`, specialist tests |
| Marketing (post-ship) | `web/components/home/capabilities.data.ts` — drop `upcoming` on Research specialist |

Exact specialist file split may adjust during planning; contracts above are normative.

---

## 7. Relationship to existing systems

- **Phase 1 orchestrator** — extended, not replaced.
- **Web research skill / tools** — Research worker uses the same executors and confirm path with a tighter allowlist + prompt.
- **Document generation / content-quality** — Document worker calls existing `generate_document` path; no parallel writer.
- **Project-first coding** — Independent gate; takes precedence over Knowledge preferential.
- **Load protection** — Unchanged boundary sampling.
- **Marketing catalog** — Research specialist marked shipped only after implementation lands.

---

## Out of scope follow-ups

- Phase 3 Code specialists (pair with project-first coding improvements).
- Fact-check-driven re-research loops.
- Critic / reviewer quality loops beyond Fact Checker.
- Disk pressure monitoring (load-protection follow-up).

## Self-review checklist

- [x] No TBD/TODO placeholders in requirements
- [x] Architecture matches locked decisions (kinds, preferential, soft fact-check)
- [x] Coding path precedence explicit
- [x] Step cap interaction with fact-check insert specified
- [x] Scope fit for one implementation plan (Phase 2 Knowledge only)
