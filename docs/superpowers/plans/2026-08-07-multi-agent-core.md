# Multi-Agent Core (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional multi-agent path beside AnyLM’s single-agent chat loop: hybrid complexity gate, Planner → Router → parallel Memory/Retriever/Tool Executor workers (≤ `maxParallel`), then synthesize — with an expandable agent trail and per-role model settings.

**Architecture:** New `app/src/main/agents/` runtime. Simple turns keep today’s loop in `ipc.ts`. Complex turns call `orchestrator.runTurn(...)`, which emits extended `ActivityEvent`s over existing `chat:activity`. Security stays existing confirm/governance; Monitor is activity telemetry.

**Tech Stack:** Electron main/renderer TypeScript, local Ollama via `ollama.ts`, Bun tests (`bun:test`), existing tools/skills/RAG/memory modules.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-07-multi-agent-core-design.md`
- Phase 1 agents only: Orchestrator (code), Planner, Router, Tool Executor, Memory, Retriever; Security + Monitor as system services — no Phase 2–5 specialists.
- Simple turns must not pay multi-agent cost (`agents.enabled === false` or heuristics → single).
- Tool confirms/governance must wrap Tool Executor the same as today’s loop — no parallel bypass.
- No new user-facing IPC channel for v1; stay on `chat:send` / `chat:activity` / `chat:*`.
- `maxParallel` default `2`; role models `null` → selected chat model.
- Commit only when the user explicitly asks (skip plan commit steps otherwise).
- Prefer pure, testable modules; mock Ollama/workers in unit tests.

## File map

| File | Responsibility |
|------|----------------|
| `app/src/types/domain.d.ts` | `AgentSettings`, extend `AppSettings` + `ActivityEvent` |
| `app/src/main/settings.ts` | Defaults + deep-merge `agents` on write |
| `app/src/main/agents/types.ts` | Plan/step/result types + orchestrator context |
| `app/src/main/agents/settings.ts` | `resolveAgentSettings`, `modelForRole` |
| `app/src/main/agents/complexity.ts` | Heuristics + classify result type |
| `app/src/main/agents/plan.ts` | Parse/validate/repair plan JSON |
| `app/src/main/agents/router.ts` | Rule-based step kind assignment |
| `app/src/main/agents/scheduler.ts` | Dependency waves + `maxParallel` |
| `app/src/main/agents/planner.ts` | LLM plan generation (uses `ollama.generate`) |
| `app/src/main/agents/classify.ts` | Ambiguous-case Router LLM classify |
| `app/src/main/agents/workers.ts` | Memory / retrieve / tool adapters |
| `app/src/main/agents/orchestrator.ts` | Full multi-agent turn |
| `app/src/main/agents/*.test.ts` | Unit tests |
| `app/src/main/ipc.ts` | Gate + branch to orchestrator or single-agent |
| `app/src/renderer/js/turns.ts` | Trail labels + paint for agent events |
| `app/src/renderer/js/settings.ts` + `index.html` + `styles.css` | Agents settings UI |
| `app/src/renderer/js/agent-trail.ts` | Pure trail summary helpers (testable) |

---

### Task 1: Domain types + agent settings helpers

**Files:**
- Modify: `app/src/types/domain.d.ts`
- Modify: `app/src/main/settings.ts`
- Create: `app/src/main/agents/types.ts`
- Create: `app/src/main/agents/settings.ts`
- Create: `app/src/main/agents/settings.test.ts`

**Interfaces:**
- Produces:
  - `interface AgentModelMap { planner: string | null; router: string | null; toolExecutor: string | null; synthesize: string | null }`
  - `interface AgentSettings { enabled: boolean; maxParallel: number; models: AgentModelMap }`
  - `AppSettings.agents: AgentSettings`
  - `resolveAgentSettings(s: AppSettings): AgentSettings`
  - `modelForRole(agents: AgentSettings, role: keyof AgentModelMap, chatModel: string): string`
  - ActivityEvent additions (used in Task 6+):
    - `{ kind: "agent:plan"; steps: { id: string; goal: string; kind: string }[] }`
    - `{ kind: "agent:step"; id: string; goal: string; kind: string; parallelGroup: number; status: "running" | "done" | "error"; detail?: string }`
    - `{ kind: "agent:merge" }`

- [ ] **Step 1: Extend `domain.d.ts`**

Add near settings types:

```ts
interface AgentModelMap {
  planner: string | null;
  router: string | null;
  toolExecutor: string | null;
  synthesize: string | null;
}

interface AgentSettings {
  enabled: boolean;
  maxParallel: number;
  models: AgentModelMap;
}
```

Add `agents: AgentSettings` to `AppSettings`.

Extend `ActivityEvent` union with the three `agent:*` variants above.

- [ ] **Step 2: Defaults + deep-merge in `settings.ts`**

```ts
agents: {
  enabled: true,
  maxParallel: 2,
  models: {
    planner: null,
    router: null,
    toolExecutor: null,
    synthesize: null,
  },
},
```

In `write`, merge nested agents:

```ts
function write(patch: Partial<AppSettings>): AppSettings {
  const prev = read();
  const next: AppSettings = { ...prev, ...patch };
  if (patch.agents) {
    next.agents = {
      ...prev.agents,
      ...patch.agents,
      models: { ...prev.agents.models, ...(patch.agents.models || {}) },
      maxParallel: Math.max(1, Number(patch.agents.maxParallel ?? prev.agents.maxParallel) || 2),
    };
  }
  fs.writeFileSync(filePath(), JSON.stringify(next, null, 2));
  return next;
}
```

Ensure `read()` still spreads `DEFAULTS` so older settings files get `agents`.

- [ ] **Step 3: Failing tests for `modelForRole` / resolve**

```ts
// app/src/main/agents/settings.test.ts
import { describe, expect, test } from "bun:test";
import { modelForRole, resolveAgentSettings } from "./settings";
import type { AgentSettings } from "./types";

const base: AgentSettings = {
  enabled: true,
  maxParallel: 2,
  models: { planner: null, router: "tiny", toolExecutor: null, synthesize: null },
};

describe("modelForRole", () => {
  test("falls back to chat model when null", () => {
    expect(modelForRole(base, "planner", "llama3.2")).toBe("llama3.2");
  });
  test("uses configured role model", () => {
    expect(modelForRole(base, "router", "llama3.2")).toBe("tiny");
  });
});

describe("resolveAgentSettings", () => {
  test("clamps maxParallel to at least 1", () => {
    const r = resolveAgentSettings({
      agents: { ...base, maxParallel: 0 },
    } as AppSettings);
    expect(r.maxParallel).toBe(1);
  });
});
```

- [ ] **Step 4: Implement `agents/types.ts` + `agents/settings.ts`**

```ts
// types.ts
export type AgentStepKind = "memory" | "retrieve" | "tool" | "synthesize";

export interface AgentStep {
  id: string;
  goal: string;
  dependsOn: string[];
  kind: AgentStepKind;
  toolHint?: string;
}

export interface AgentPlan {
  steps: AgentStep[];
}

export interface StepResult {
  id: string;
  ok: boolean;
  output: string;
  error?: string;
}

export type AgentRole = "planner" | "router" | "toolExecutor" | "synthesize";

export interface AgentModelMap {
  planner: string | null;
  router: string | null;
  toolExecutor: string | null;
  synthesize: string | null;
}

export interface AgentSettings {
  enabled: boolean;
  maxParallel: number;
  models: AgentModelMap;
}
```

```ts
// settings.ts
import * as appSettings from "../settings";
import type { AgentSettings } from "./types";

export function resolveAgentSettings(s?: AppSettings): AgentSettings {
  const agents = (s || appSettings.read()).agents;
  return {
    enabled: agents?.enabled !== false,
    maxParallel: Math.max(1, Number(agents?.maxParallel) || 2),
    models: {
      planner: agents?.models?.planner ?? null,
      router: agents?.models?.router ?? null,
      toolExecutor: agents?.models?.toolExecutor ?? null,
      synthesize: agents?.models?.synthesize ?? null,
    },
  };
}

export function modelForRole(
  agents: AgentSettings,
  role: keyof AgentSettings["models"],
  chatModel: string
): string {
  return agents.models[role] || chatModel;
}
```

- [ ] **Step 5: Run tests**

Run: `cd app && bun test src/main/agents/settings.test.ts`

Expected: PASS

---

### Task 2: Complexity heuristics

**Files:**
- Create: `app/src/main/agents/complexity.ts`
- Create: `app/src/main/agents/complexity.test.ts`

**Interfaces:**
- Produces:
  - `type ComplexityLean = "simple" | "complex" | "ambiguous"`
  - `interface ComplexityInput { text: string; useTools: boolean; hasProject: boolean; hasAttachments: boolean }`
  - `leanComplexity(input: ComplexityInput): ComplexityLean`

- [ ] **Step 1: Failing tests**

```ts
import { describe, expect, test } from "bun:test";
import { leanComplexity } from "./complexity";

describe("leanComplexity", () => {
  test("simple short Q&A without tools", () => {
    expect(
      leanComplexity({
        text: "What is 2+2?",
        useTools: false,
        hasProject: false,
        hasAttachments: false,
      })
    ).toBe("simple");
  });

  test("complex when URL present", () => {
    expect(
      leanComplexity({
        text: "Summarize https://example.com/docs",
        useTools: true,
        hasProject: false,
        hasAttachments: false,
      })
    ).toBe("complex");
  });

  test("complex for multi-step language + tools", () => {
    expect(
      leanComplexity({
        text: "First search the web, then compare with project docs and write a summary",
        useTools: true,
        hasProject: true,
        hasAttachments: false,
      })
    ).toBe("complex");
  });

  test("ambiguous borderline", () => {
    expect(
      leanComplexity({
        text: "Help me organize my notes a bit",
        useTools: true,
        hasProject: false,
        hasAttachments: false,
      })
    ).toBe("ambiguous");
  });
});
```

Tune fixtures after implementing so “ambiguous” is intentional.

- [ ] **Step 2: Implement heuristics**

```ts
const URL_RE = /https?:\/\/\S+/i;
const MULTI_STEP_RE =
  /\b(first|then|after that|multi-?step|step by step|and then|finally)\b/i;
const CODE_RE = /\b(code|refactor|debug|stack trace|pull request|unit test)\b/i;
const FILE_RE = /\b(file|folder|directory|pdf|docx|csv)\b/i;

export function leanComplexity(input: ComplexityInput): ComplexityLean {
  const text = (input.text || "").trim();
  if (!text) return "simple";

  let score = 0;
  if (URL_RE.test(text)) score += 3;
  if (MULTI_STEP_RE.test(text)) score += 3;
  if (CODE_RE.test(text)) score += 2;
  if (FILE_RE.test(text)) score += 1;
  if (input.useTools) score += 1;
  if (input.hasProject) score += 1;
  if (input.hasAttachments) score += 2;
  if (text.length > 400) score += 2;
  if (text.length > 1200) score += 2;

  if (score >= 4) return "complex";
  if (score <= 1) return "simple";
  return "ambiguous";
}
```

Adjust thresholds until the four tests pass.

- [ ] **Step 3: Run tests**

Run: `cd app && bun test src/main/agents/complexity.test.ts`

Expected: PASS

---

### Task 3: Plan parse + rule router + scheduler

**Files:**
- Create: `app/src/main/agents/plan.ts`
- Create: `app/src/main/agents/router.ts`
- Create: `app/src/main/agents/scheduler.ts`
- Create: `app/src/main/agents/plan.test.ts`
- Create: `app/src/main/agents/scheduler.test.ts`

**Interfaces:**
- Produces:
  - `parsePlan(raw: string): AgentPlan | null`
  - `assignKinds(plan: AgentPlan): AgentPlan`
  - `nextWave(steps: AgentStep[], done: Set<string>, maxParallel: number): AgentStep[]`

- [ ] **Step 1: Failing plan/scheduler tests**

```ts
// plan.test.ts
import { describe, expect, test } from "bun:test";
import { parsePlan } from "./plan";
import { assignKinds } from "./router";

test("parsePlan accepts valid JSON", () => {
  const p = parsePlan(
    JSON.stringify({
      steps: [
        { id: "1", goal: "Recall prior decisions", dependsOn: [], kind: "memory" },
        { id: "2", goal: "Retrieve project docs about X", dependsOn: [], kind: "retrieve" },
        { id: "3", goal: "Answer using gathered context", dependsOn: ["1", "2"], kind: "synthesize" },
      ],
    })
  );
  expect(p?.steps.length).toBe(3);
});

test("parsePlan rejects garbage", () => {
  expect(parsePlan("not json")).toBeNull();
});

test("assignKinds maps retrieve-ish goals", () => {
  const p = assignKinds({
    steps: [{ id: "a", goal: "Search project documents for budget", dependsOn: [], kind: "tool" }],
  });
  expect(p.steps[0].kind).toBe("retrieve");
});
```

```ts
// scheduler.test.ts
import { describe, expect, test } from "bun:test";
import { nextWave } from "./scheduler";
import type { AgentStep } from "./types";

const steps: AgentStep[] = [
  { id: "a", goal: "A", dependsOn: [], kind: "memory" },
  { id: "b", goal: "B", dependsOn: [], kind: "retrieve" },
  { id: "c", goal: "C", dependsOn: ["a", "b"], kind: "synthesize" },
];

test("first wave respects maxParallel", () => {
  const w = nextWave(steps, new Set(), 2);
  expect(w.map((s) => s.id).sort()).toEqual(["a", "b"]);
});

test("queues remainder when maxParallel is 1", () => {
  const w = nextWave(steps, new Set(), 1);
  expect(w.length).toBe(1);
  expect(["a", "b"]).toContain(w[0].id);
});

test("synthesize waits for deps", () => {
  expect(nextWave(steps, new Set(["a"]), 2).map((s) => s.id)).toEqual(["b"]);
  expect(nextWave(steps, new Set(["a", "b"]), 2).map((s) => s.id)).toEqual(["c"]);
});
```

- [ ] **Step 2: Implement parse / router / scheduler**

`parsePlan`: strip optional markdown fences; `JSON.parse`; require `steps` array; each step needs non-empty `id`, `goal`; normalize `dependsOn` to string[]; coerce `kind` if present else `"tool"`.

`assignKinds` rules (rules win for Phase 1 consistency):
- goal matches `/retriev|document|rag|project (doc|context)|knowledge base/i` → `retrieve`
- goal matches `/memor|prior (chat|decision)|what we (said|decided)/i` → `memory`
- goal matches `/synthes|final answer|write the reply|compose/i` → `synthesize`
- else → `tool`

`nextWave`: filter steps whose deps ⊆ `done` and id ∉ `done`; take up to `maxParallel`; stable by original order.

- [ ] **Step 3: Run tests**

Run: `cd app && bun test src/main/agents/plan.test.ts src/main/agents/scheduler.test.ts`

Expected: PASS

---

### Task 4: Classifier + planner LLM wrappers (mockable)

**Files:**
- Create: `app/src/main/agents/classify.ts`
- Create: `app/src/main/agents/planner.ts`
- Create: `app/src/main/agents/classify.test.ts`
- Create: `app/src/main/agents/planner.test.ts`

**Interfaces:**
- Produces:
  - `parseClassify(text: string): "single" | "multi" | null`
  - `async classifyComplexity(opts: { model: string; text: string; preferMulti: boolean; generate: (model: string, prompt: string) => Promise<string> }): Promise<"single" | "multi">`
  - `async planTurn(opts: { model: string; userText: string; generate: (model: string, prompt: string) => Promise<string> }): Promise<AgentPlan | null>`

- [ ] **Step 1: Failing parse tests (no live Ollama)**

```ts
import { describe, expect, test } from "bun:test";
import { parseClassify } from "./classify";

test("parseClassify reads single/multi", () => {
  expect(parseClassify('{"mode":"multi"}')).toBe("multi");
  expect(parseClassify("SINGLE")).toBe("single");
  expect(parseClassify("nope")).toBeNull();
});
```

```ts
import { describe, expect, test } from "bun:test";
import { planTurn } from "./planner";

test("planTurn returns plan from generate", async () => {
  const plan = await planTurn({
    model: "x",
    userText: "Do A and B",
    generate: async () =>
      JSON.stringify({
        steps: [
          { id: "1", goal: "Do A", dependsOn: [], kind: "tool" },
          { id: "2", goal: "Do B", dependsOn: [], kind: "tool" },
        ],
      }),
  });
  expect(plan?.steps.length).toBe(2);
});

test("planTurn repairs once then null", async () => {
  let n = 0;
  const plan = await planTurn({
    model: "x",
    userText: "x",
    generate: async () => {
      n += 1;
      return n === 1 ? "NOT JSON" : "STILL BAD";
    },
  });
  expect(plan).toBeNull();
  expect(n).toBe(2);
});
```

- [ ] **Step 2: Implement**

`parseClassify`: prefer JSON `mode` field; else `\bmulti\b` / `\bsingle\b`.

`classifyComplexity`: prompt for JSON `{"mode":"single"|"multi"}` only; on null/throw return `preferMulti ? "multi" : "single"`.

`planTurn`: prompt requiring JSON plan with ≤ 6 steps; `parsePlan`; if null, second `generate` with repair prompt; `parsePlan` again; else null.

- [ ] **Step 3: Run tests**

Run: `cd app && bun test src/main/agents/classify.test.ts src/main/agents/planner.test.ts`

Expected: PASS

---

### Task 5: Orchestrator scheduler loop (mocked workers)

**Files:**
- Create: `app/src/main/agents/orchestrator.ts`
- Create: `app/src/main/agents/orchestrator.test.ts`

**Interfaces:**
- Produces:
  - `interface OrchestratorDeps` with `planTurn`, `assignKinds`, `runStep`, `synthesize`, `act`, `isCancelled`, `maxParallel`
  - `async runOrchestratedTurn(userText: string, deps: OrchestratorDeps): Promise<{ text: string; fellBack: boolean }>`
  - On planner null → `{ text: ""; fellBack: true }`

- [ ] **Step 1: Failing orchestrator tests**

```ts
import { describe, expect, test } from "bun:test";
import { runOrchestratedTurn } from "./orchestrator";
import type { StepResult } from "./types";

test("falls back when planner fails", async () => {
  const r = await runOrchestratedTurn("hi", {
    maxParallel: 2,
    planTurn: async () => null,
    assignKinds: (p) => p,
    runStep: async () => ({ id: "x", ok: true, output: "" }),
    synthesize: async () => "nope",
    act: () => {},
    isCancelled: () => false,
  });
  expect(r.fellBack).toBe(true);
});

test("runs independent steps with maxParallel and emits events", async () => {
  const events: string[] = [];
  const started: string[] = [];
  const r = await runOrchestratedTurn("do stuff", {
    maxParallel: 2,
    planTurn: async () => ({
      steps: [
        { id: "a", goal: "mem", dependsOn: [], kind: "memory" },
        { id: "b", goal: "rag", dependsOn: [], kind: "retrieve" },
        { id: "c", goal: "final", dependsOn: ["a", "b"], kind: "synthesize" },
      ],
    }),
    assignKinds: (p) => p,
    runStep: async (step) => {
      started.push(step.id);
      return { id: step.id, ok: true, output: step.id + "-out" };
    },
    synthesize: async (_ctx, results: StepResult[]) => results.map((x) => x.output).join("|"),
    act: (e) => events.push(e.kind),
    isCancelled: () => false,
  });
  expect(r.fellBack).toBe(false);
  expect(started.sort()).toEqual(["a", "b"]);
  expect(events).toContain("agent:plan");
  expect(events).toContain("agent:merge");
  expect(r.text).toContain("a-out");
});
```

Synthesize-kind steps must **not** call `runStep`; merge via `synthesize()` after deps complete.

- [ ] **Step 2: Implement `runOrchestratedTurn`**

1. `plan = await planTurn(...)`; if null return fellBack.
2. `plan = assignKinds(plan)`.
3. `act({ kind: "agent:plan", steps })`.
4. Wave loop with `nextWave` on non-synthesize steps; emit `agent:step`; `Promise.all(runStep)`; record results (failures still mark done).
5. `act({ kind: "agent:merge" })`; return synthesize output.

- [ ] **Step 3: Run tests**

Run: `cd app && bun test src/main/agents/orchestrator.test.ts`

Expected: PASS

---

### Task 6: Workers + IPC wiring

**Files:**
- Create: `app/src/main/agents/workers.ts`
- Modify: `app/src/main/ipc.ts` (chat:send branch)

**Interfaces:**
- Consumes: orchestrator, complexity, classify, planner, settings helpers, `memory.recall`, context/vectorstore, tools/skills executors, `confirm`/`ask`
- Produces: multi-agent branch or existing single-agent loop

- [ ] **Step 1: Implement `makeWorkers` in `workers.ts`**

- `memory`: `memory.recall` when project present; else `"(no project memory)"`.
- `retrieve`: project `context.retrieve` and/or `vectorstore.search`; join excerpts; cap ~6000 chars.
- `tool`: bounded mini tool loop (max 3 rounds) with `toolExecutor` model; reuse `skillsExec` / `toolsExec` + `confirm` / `ask` + `act` tool events; check cancellation between rounds.

- [ ] **Step 2: Gate in `chat:send` after `full` is built, before the single-agent `for (;;)`**

```ts
const agentCfg = resolveAgentSettings(settings.read());
const lastText = lastUser?.content || "";
let useMulti = false;
if (agentCfg.enabled && lastText) {
  const lean = leanComplexity({
    text: lastText,
    useTools: !!useTools,
    hasProject: !!project,
    hasAttachments: !!(attachments?.docs?.length || attachments?.images?.length),
  });
  if (lean === "complex") useMulti = true;
  else if (lean === "ambiguous") {
    try {
      const mode = await classifyComplexity({
        model: modelForRole(agentCfg, "router", useModel),
        text: lastText,
        preferMulti: !!useTools || !!project,
        generate: ollama.generate,
      });
      useMulti = mode === "multi";
    } catch {
      useMulti = !!useTools || !!project;
    }
  }
}

if (useMulti) {
  act({ kind: "status", text: "Planning…" });
  const runStep = makeWorkers({ /* project, threadId, confirm, ask, act, toolModel, ... */ });
  const result = await runOrchestratedTurn(lastText, {
    maxParallel: agentCfg.maxParallel,
    planTurn: () =>
      planTurn({
        model: modelForRole(agentCfg, "planner", useModel),
        userText: lastText,
        generate: ollama.generate,
      }),
    assignKinds,
    runStep,
    synthesize: async (_ctx, results) => {
      // Append worker notes to messages; stream with synthesize model via chatStream
      // onPiece → chat:chunk; return final text
    },
    act,
    isCancelled: () => cancelledChats.has(id),
  });
  if (!result.fellBack) {
    // same governance.report / chat:done / persist as single path; return
  }
  act({ kind: "status", text: "Falling back to standard chat…" });
}
// existing for (;;) single-agent loop
```

- [ ] **Step 3: Manual smoke**

Run: `cd app && bun start`

- `What is 2+2?` → no Planning trail.
- Tools on + multi-step prompt → Planning… + agent trail.

---

### Task 7: Agent trail UI

**Files:**
- Create: `app/src/renderer/js/agent-trail.ts`
- Create: `app/src/renderer/js/agent-trail.test.ts`
- Modify: `app/src/renderer/js/turns.ts`
- Modify: `app/src/renderer/styles.css`

**Interfaces:**
- Produces:
  - `summarizeAgentTrail(events: ActivityEvent[]): { title: string; lines: string[] } | null`
  - `stripLabel` / `onActivity` / trail paint handle `agent:*` events

- [ ] **Step 1: Failing trail helper tests**

```ts
import { describe, expect, test } from "bun:test";
import { summarizeAgentTrail } from "./agent-trail";

test("summarize collapses plan", () => {
  const s = summarizeAgentTrail([
    {
      kind: "agent:plan",
      steps: [
        { id: "1", goal: "A", kind: "memory" },
        { id: "2", goal: "B", kind: "retrieve" },
      ],
    },
    { kind: "agent:step", id: "1", goal: "A", kind: "memory", parallelGroup: 0, status: "done" },
    { kind: "agent:step", id: "2", goal: "B", kind: "retrieve", parallelGroup: 0, status: "running" },
  ]);
  expect(s?.title).toMatch(/Planned 2 steps/i);
  expect(s?.lines.length).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Implement helper + wire `turns.ts`**

- `stripLabel`: `agent:plan` → `Planning…`; running step → goal/kind; `agent:merge` → `Combining results…`.
- Append agent events in `onActivity`; repaint trail.
- Collapsed `<details class="agent-trail">` by default; follow existing activity visual tokens.

- [ ] **Step 3: Run tests**

Run: `cd app && bun test src/renderer/js/agent-trail.test.ts`

Expected: PASS

---

### Task 8: Settings UI (models + maxParallel + enable)

**Files:**
- Modify: `app/src/renderer/index.html` (`#settings-panel-general`)
- Modify: `app/src/renderer/js/settings.ts`
- Modify: `app/src/renderer/styles.css` if needed

**Interfaces:**
- Consumes: `getSettings` / `setSettings`, installed models list API used by Models view
- Produces: persisted `agents` patch

- [ ] **Step 1: Add General subsection markup**

```html
<section class="settings-block" id="agents-settings">
  <h2>Agents</h2>
  <p class="muted">On complex chats, AnyLM can plan and run steps in parallel.</p>
  <label class="row">
    <input type="checkbox" id="agents-enabled" />
    Enable multi-agent for complex turns
  </label>
  <label class="row">
    Max parallel steps
    <input type="number" id="agents-max-parallel" min="1" max="8" />
  </label>
  <label class="row">Planner model
    <select id="agents-model-planner"><option value="">Same as chat</option></select>
  </label>
  <label class="row">Router model
    <select id="agents-model-router"><option value="">Same as chat</option></select>
  </label>
  <label class="row">Tool executor model
    <select id="agents-model-tool"><option value="">Same as chat</option></select>
  </label>
  <label class="row">Synthesize model
    <select id="agents-model-synth"><option value="">Same as chat</option></select>
  </label>
</section>
```

- [ ] **Step 2: Bind in `settings.ts`**

Load `settings.agents` into controls; populate selects from installed models; on change `save({ agents: { ... } })` with empty string → `null`.

- [ ] **Step 3: Smoke**

Toggle `maxParallel`, disable agents, confirm single path; re-enable.

---

### Task 9: Spec coverage checklist

**Files:** none (verification)

- [ ] **Step 1: Run unit suite**

Run: `cd app && bun test src/main/agents src/renderer/js/agent-trail.test.ts`

Expected: all PASS

- [ ] **Step 2: Manual checklist**

| # | Check | Pass? |
|---|--------|-------|
| 1 | Simple `2+2` — no agent trail / no Planning… | |
| 2 | Complex multi-step + tools — plan trail; parallel when maxParallel≥2 | |
| 3 | Stop mid-run cancels workers / pending confirms | |
| 4 | Tool confirm still gates only that tool | |
| 5 | Unset role models use chat model | |
| 6 | `agents.enabled=false` forces single-agent | |
| 7 | Planner failure falls back to single-agent | |

- [ ] **Step 3: Spec coverage map**

Confirm Architecture → Task 6; Components → 1–5; Errors → 5–6; Settings → 1,8; Testing → 2–5,7,9.

---

## Spec coverage (self-review)

| Spec requirement | Task(s) |
|------------------|---------|
| Hybrid complexity gate | 2, 4, 6 |
| Orchestrator + Planner + Router | 3, 4, 5, 6 |
| Parallel workers ≤ maxParallel | 3, 5, 6 |
| Memory / Retriever / Tool Executor | 6 |
| Security = existing confirms | 6 |
| Monitor = activity events | 5–7 |
| Per-role model map + defaults | 1, 8 |
| Agent trail UI collapsed | 7 |
| Single-agent fallback | 5, 6 |
| Kill switch `agents.enabled` | 1, 6, 8 |
| Phase 2+ out of scope | honored |

## Placeholder / consistency notes

- No TBD in task steps.
- `ActivityEvent` kinds `agent:plan` / `agent:step` / `agent:merge` consistent across domain, orchestrator, renderer.
- `modelForRole` / `AgentSettings` match Settings UI fields.
- Synthesize steps handled by orchestrator `synthesize()`, not `runStep`.
