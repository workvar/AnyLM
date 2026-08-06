# Multi-agent core (Phase 1)

## Problem

AnyLM’s chat path is a single-agent tool loop: one model, sequential tools, up to 15 rounds. Complex turns (research + RAG + tools) are slower than they need to be and lack specialized planning/routing. A full multi-agent catalog (~23 roles) is too large for one ship; Phase 1 builds the orchestration core only.

## Decisions (locked)

- Goals: **speed** (parallel independent work) and **quality** (specialized roles).
- Activation: **automatic** on complex turns; simple turns stay on today’s single-agent loop.
- Scope: **Phase 1 core only** — Orchestrator, Planner, Router, Tool Executor, Memory, Retriever; Security and Monitor as system services.
- Model mapping: **user-configurable** per role; unset roles fall back to the selected chat model.
- Complexity detection: **hybrid** — heuristics first; Router LLM only when ambiguous.
- UI: **agent trail** — expandable per-turn trail on existing activity surface; collapsed by default.
- Parallelism: **Settings** `maxParallel`, default **2**.
- Architecture: **Orchestrator graph in main** beside the existing chat loop (not a full framework rewrite, not a sidecar).

## Goals

1. Keep simple chats as fast as today (no forced multi-agent).
2. On complex turns, plan → route → run independent steps in parallel (≤ `maxParallel`) → synthesize one reply.
3. Reuse existing tools, skills, RAG, memory, confirms, governance, and activity events.
4. Expose a clear agent trail without a new dashboard.
5. Leave clean extension points for Phase 2+ specialists (Research, Coder, etc.).

## Non-goals (Phase 1)

- Phase 2–5 agents (Research, Fact Checker, Coder, Debugger, Tester, Reviewer, Critic, Document Writer, Summarizer, Scheduler, Notification, Vision, Voice, Math, Data Analyst).
- Critic/reviewer quality loops.
- Always-on multi-agent on every turn.
- Separate multi-agent panel / swarm UI.
- Cross-chat or background agent swarms.
- Replacing the single-agent loop entirely.

## Deferred agent catalog (later phases)

| Phase | Agents |
| --- | --- |
| 2 — Knowledge | Research, Fact Checker, Summarizer, Document Writer |
| 3 — Code | Coder, Debugger, Tester, Reviewer, Critic |
| 4 — Domain | Math, Data Analyst, Scheduler, Notification |
| 5 — Modalities | Vision, Voice |

---

## 1. Architecture

Keep the current single-agent tool loop as the **default path**. On each `chat:send` turn:

1. **Complexity gate (hybrid)**
   - Fast heuristics: tools enabled, URLs, multi-step language, code/files, project RAG likely, long prompt.
   - Clear simple → single-agent. Clear complex → multi-agent. Ambiguous → small **Router** classify call (`single` | `multi`).

2. **Multi-agent path** (`app/src/main/agents/`)
   - **Orchestrator** (code, not an LLM): turn lifecycle, budgets, cancellation, scheduling, merge.
   - **Planner** (LLM): structured plan with subtasks and dependencies.
   - **Router** (rules + optional LLM): map each subtask → Memory / Retriever / Tool Executor / synthesize.
   - **Workers** run in waves up to `maxParallel`:
     - **Memory** — chat/project memory retrieval
     - **Retriever** — existing RAG / Chroma
     - **Tool Executor** — existing tools/skills + confirm/ask
   - Orchestrator merges worker outputs → one synthesis pass (chat / configured model) → final reply.

3. **System services (not LLM agents)**
   - **Security**: existing confirm/ask, governance, PII — wrap every tool call.
   - **Monitor**: activity events + timing/failure metrics feeding the agent trail.

4. **Settings**
   - Per-role model map: Planner, Router, Tool Executor, synthesis (and classify if distinct).
   - `maxParallel` (default 2).
   - Unset roles → user’s selected chat model.

---

## 2. Components & contracts

### Module layout

| Unit | Responsibility | Depends on |
| --- | --- | --- |
| `complexity.ts` | Heuristics + optional Router classify | settings, ollama |
| `orchestrator.ts` | Turn lifecycle, schedule, merge, cancel | planner, router, workers, monitor |
| `planner.ts` | Plan JSON | ollama, role model |
| `router.ts` | Assign step `kind` | rules + optional LLM |
| `workers/*.ts` | Adapters over Memory / RAG / tools+skills | existing main modules |
| `settings.ts` | Role→model map, `maxParallel`, defaults | store/settings |
| `types.ts` | Shared plan/step/result types | — |

### Plan shape

```ts
type AgentStepKind = "memory" | "retrieve" | "tool" | "synthesize";

interface AgentStep {
  id: string;
  goal: string;
  dependsOn: string[];
  kind: AgentStepKind;
  /** Optional tool hint when kind === "tool" */
  toolHint?: string;
}

interface AgentPlan {
  steps: AgentStep[];
}
```

### Activity / UI trail

Extend existing activity events (no new user-facing IPC channel for v1):

- `agent:plan` — plan steps
- `agent:step` — start / done / error per step (include `parallelGroup`)
- `agent:merge` — synthesis started
- Existing `tool` / `thinking` / `status` events still fire inside Tool Executor

Trail UI: collapsed by default (e.g. “Planned 4 steps · 2 in parallel”); expand shows Planner → parallel branches → merge.

### IPC

Multi-agent stays inside `chat:send`. Orchestrator emits via the same activity / `chat:*` paths used today. Stop/cancel continues to reject pending confirms/asks for that chat id.

---

## 3. Data flow & error handling

### Happy path

```
chat:send
  → complexity gate
      → simple: existing single-agent loop
      → multi:
          Orchestrator
            → Planner (structured plan)
            → Router (kinds + dependency waves)
            → run ready steps (≤ maxParallel)
                 Memory / Retriever / Tool Executor
                 (Security wraps tool confirms)
            → when deps satisfied, run next wave
            → synthesize final reply
            → chat:done + persist (same as today)
```

### Errors & edge cases

| Case | Behavior |
| --- | --- |
| Planner returns invalid JSON | One repair retry; then fall back to single-agent loop |
| A worker step fails | Mark step failed; continue independent steps; synthesis sees failure notes |
| Tool confirm denied | Same as today — that tool aborts; sibling parallel steps keep going |
| User stops turn | Abort all in-flight worker calls; reject pending confirms/asks for that chat |
| Router classify fails / times out | Treat as **multi** if heuristics leaned complex, else **single** |
| Role model missing / Ollama error | Fall back to chat model for that role; if chat model fails → `chat:error` |
| Context too large after workers | Truncate/summarize worker outputs before synthesis (prefer recent + failed-step notes) |
| Parallel overload | Hard cap from Settings; queue remainder; never exceed `maxParallel` |

---

## 4. Settings (v1)

| Key | Default | Notes |
| --- | --- | --- |
| `agents.maxParallel` | `2` | Integer ≥ 1; UI in Settings |
| `agents.models.planner` | `null` | Falls back to chat model |
| `agents.models.router` | `null` | Used for classify + optional step routing |
| `agents.models.toolExecutor` | `null` | If Tool Executor needs its own generation |
| `agents.models.synthesize` | `null` | Final merge/reply model |
| `agents.enabled` | `true` | Kill switch; when false, always single-agent |

---

## 5. Testing

### Automated (bun)

- `complexity.ts` — heuristic fixtures (simple Q&A vs URL / multi-step / tools / RAG)
- Planner/router parsers — valid plan, bad JSON + repair, dependency ordering
- Orchestrator scheduler — parallel waves honor `maxParallel` and `dependsOn`
- Fallback — planner failure → single-agent path
- Settings — role model fallback; `maxParallel` default 2

### Manual / smoke

- Simple “what’s 2+2?” stays single-agent (no plan trail)
- Complex “research X and summarize with project docs” shows plan trail + parallel retrieve/tools
- Stop mid-run cancels workers
- Confirm prompt still blocks only the relevant tool

### Success criteria

1. Simple turns are not slower than today (no forced multi-agent).
2. Complex turns can run ≥2 independent steps concurrently when `maxParallel` ≥ 2.
3. Agent trail is readable and collapsed by default.
4. Existing Security (confirms/governance) still gates tools.
5. Unconfigured role models fall back cleanly to the chat model.

---

## 6. Files (expected)

| Area | Paths |
| --- | --- |
| Agents runtime | `app/src/main/agents/**` |
| Chat wiring | `app/src/main/ipc.ts` (gate + call orchestrator; keep single-agent path) |
| Settings | `app/src/main/settings.ts` (+ renderer Settings UI for map / maxParallel) |
| Activity / trail | `app/src/renderer/js/activity.ts`, `turns.ts`, `working-strip*.ts`, styles |
| Tests | `app/src/main/agents/*.test.ts` |

Exact file split within `agents/` may adjust during planning; contracts above are normative.

---

## 7. Relationship to existing systems

- **Tools / skills / recover-tool-calls** — Tool Executor reuses current executors; no parallel bypass of confirms.
- **RAG / Chroma / memory / vectorstore** — Retriever and Memory are adapters, not new stores.
- **Governance / PII / proxy** — unchanged Security services; multi-agent does not weaken gates.
- **Activity / Working strip** — Monitor feeds richer labels and the expandable agent trail.

---

## Self-review checklist

- [x] No TBD/TODO placeholders in requirements
- [x] Architecture matches Phase 1 scope (no Phase 2+ agents in v1 path)
- [x] Security/Monitor explicitly system services
- [x] Single-agent fallback paths specified
- [x] Scope fit for one implementation plan
