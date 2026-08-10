# Multi-Agent Phase 2 — Knowledge Specialists Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the Phase 1 multi-agent graph with four Knowledge step kinds (`research`, `fact_check`, `summarize`, `document`): preferential activation, soft-default Fact Checker after Research, specialist prompts/allowlists, optional per-role models, and trail labels — without a separate orchestrator.

**Architecture:** Pure helpers under `app/src/main/agents/` (preferential complexity, router patterns, `fact-check-insert`, `specialists/*`). `workers.ts` dispatches new kinds through the existing mini tool-loop with filtered tools + specialist prompts. `orchestrator.ts` runs soft fact-check insert after `assignKinds`. `ipc.ts` keeps project-first coding precedence and adds synthesize uncertainty guidance. Settings UI adds four model selects.

**Tech Stack:** Electron main/renderer TypeScript, Ollama via existing `ollama.ts`, Bun tests (`bun:test`), existing tools/skills/confirms/document generation/activity trail.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-10-multi-agent-phase2-knowledge-design.md`
- Phase 2 Knowledge only — no Phase 3–5 agents, no auto re-research loops
- First-class kinds on the Phase 1 graph; reuse confirms, load-guard, activity trail
- Preferential Knowledge lean → `complex`; project-first coding still forces `useMulti = false`
- Soft-insert `fact_check` after `research` unless fetch-only or would exceed **6** steps
- Research/Document model fallback: role → `toolExecutor` → chat; Fact check/Summarize: role → chat
- Commit steps run only when the user explicitly asks to commit (user rule); otherwise skip commits and leave changes unstaged
- Prefer pure, testable modules; keep `ipc.ts` wiring thin

## File map

| File | Responsibility |
|------|----------------|
| `app/src/types/domain.d.ts` | Extend ambient `AgentModelMap` |
| `app/src/main/agents/types.ts` | Extend `AgentStepKind`, `AgentRole`, `AgentModelMap` |
| `app/src/main/settings.ts` | Defaults for four new model keys |
| `app/src/main/agents/settings.ts` | Resolve new models; `modelForStepKind` |
| `app/src/main/agents/complexity.ts` | Preferential Knowledge → `complex`; export detector |
| `app/src/main/agents/plan.ts` | Accept new kinds in `VALID_KINDS` |
| `app/src/main/agents/planner.ts` | 8-kind prompt + optional preferential bias |
| `app/src/main/agents/router.ts` | Knowledge patterns; preserve non-`tool` planned kinds |
| `app/src/main/agents/fact-check-insert.ts` | Soft-insert helper |
| `app/src/main/agents/specialists/prompts.ts` | System prompts per Knowledge kind |
| `app/src/main/agents/specialists/allowlists.ts` | Tool name allowlists + filter helper |
| `app/src/main/agents/specialists/labels.ts` | Human labels for trail (`Research`, …) |
| `app/src/main/agents/workers.ts` | Dispatch Knowledge kinds |
| `app/src/main/agents/orchestrator.ts` | Call fact-check insert after assignKinds |
| `app/src/main/ipc.ts` | Planner bias flag; synthesize dispute guidance; worker models |
| `app/src/renderer/index.html` + `js/settings.ts` | Four model selects |
| `app/src/renderer/js/agent-trail.ts` (+ `turns.ts` if needed) | Friendly stepKind labels |
| `web/components/home/capabilities.data.ts` | Unmark Research specialist as upcoming (final task) |

Paths under `app/` below are relative to `app/` unless noted.

---

### Task 1: Types + settings resolve

**Files:**
- Modify: `src/types/domain.d.ts`
- Modify: `src/main/agents/types.ts`
- Modify: `src/main/settings.ts`
- Modify: `src/main/agents/settings.ts`
- Modify: `src/main/agents/settings.test.ts`

**Interfaces:**
- Produces:
  - `AgentStepKind` includes `"research" | "fact_check" | "summarize" | "document"`
  - `AgentRole` / `AgentModelMap` include `research`, `factCheck`, `summarize`, `document` (`string | null`)
  - `modelForStepKind(agents, kind, chatModel): string`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/main/agents/settings.test.ts — add cases
import { describe, expect, test } from "bun:test";
import { modelForRole, modelForStepKind, resolveAgentSettings } from "./settings";
import type { AgentSettings } from "./types";

const base: AgentSettings = {
  enabled: true,
  maxParallel: 2,
  models: {
    planner: null,
    router: null,
    toolExecutor: "tool-model",
    synthesize: null,
    research: null,
    factCheck: null,
    summarize: null,
    document: null,
  },
  loadProtection: { enabled: true, killPercent: 90 },
};

test("research falls back through toolExecutor", () => {
  expect(modelForStepKind(base, "research", "chat")).toBe("tool-model");
});

test("fact_check falls back to chat", () => {
  expect(modelForStepKind(base, "fact_check", "chat")).toBe("chat");
});

test("document uses document model when set", () => {
  const agents = {
    ...base,
    models: { ...base.models, document: "doc-model" },
  };
  expect(modelForStepKind(agents, "document", "chat")).toBe("doc-model");
});

test("resolveAgentSettings defaults new model keys to null", () => {
  const r = resolveAgentSettings({ agents: { enabled: true, maxParallel: 2, models: {} } } as AppSettings);
  expect(r.models.research).toBeNull();
  expect(r.models.factCheck).toBeNull();
  expect(r.models.summarize).toBeNull();
  expect(r.models.document).toBeNull();
});
```

Adapt imports/`AppSettings` cast to match existing test file style.

- [ ] **Step 2: Run tests — expect FAIL**

Run: `cd app && bun test src/main/agents/settings.test.ts`  
Expected: FAIL (missing keys / `modelForStepKind` undefined)

- [ ] **Step 3: Minimal implementation**

In `domain.d.ts` and `agents/types.ts`, extend:

```typescript
type AgentStepKind =
  | "memory"
  | "retrieve"
  | "tool"
  | "synthesize"
  | "research"
  | "fact_check"
  | "summarize"
  | "document";

type AgentRole =
  | "planner"
  | "router"
  | "toolExecutor"
  | "synthesize"
  | "research"
  | "factCheck"
  | "summarize"
  | "document";

interface AgentModelMap {
  planner: string | null;
  router: string | null;
  toolExecutor: string | null;
  synthesize: string | null;
  research: string | null;
  factCheck: string | null;
  summarize: string | null;
  document: string | null;
}
```

In `settings.ts` DEFAULTS.agents.models add the four keys as `null`. Deep-merge already spreads `models` — confirm it still merges nested keys.

In `agents/settings.ts`:

```typescript
export function resolveAgentSettings(s?: AppSettings): AgentSettings {
  const agents = (s || appSettings.read()).agents;
  return {
    enabled: agents?.enabled !== false,
    maxParallel: clampMaxParallel(agents?.maxParallel),
    models: {
      planner: agents?.models?.planner ?? null,
      router: agents?.models?.router ?? null,
      toolExecutor: agents?.models?.toolExecutor ?? null,
      synthesize: agents?.models?.synthesize ?? null,
      research: agents?.models?.research ?? null,
      factCheck: agents?.models?.factCheck ?? null,
      summarize: agents?.models?.summarize ?? null,
      document: agents?.models?.document ?? null,
    },
    loadProtection: {
      enabled: agents?.loadProtection?.enabled !== false,
      killPercent: clampKillPercent(agents?.loadProtection?.killPercent),
    },
  };
}

export function modelForStepKind(
  agents: AgentSettings,
  kind: AgentStepKind,
  chatModel: string
): string {
  if (kind === "research") {
    return agents.models.research || agents.models.toolExecutor || chatModel;
  }
  if (kind === "document") {
    return agents.models.document || agents.models.toolExecutor || chatModel;
  }
  if (kind === "fact_check") {
    return agents.models.factCheck || chatModel;
  }
  if (kind === "summarize") {
    return agents.models.summarize || chatModel;
  }
  if (kind === "tool") {
    return agents.models.toolExecutor || chatModel;
  }
  // memory/retrieve/synthesize: synthesize model only matters for synthesize role elsewhere
  return chatModel;
}
```

Import `AgentStepKind` in settings.ts. Keep `modelForRole` unchanged for planner/router/toolExecutor/synthesize.

- [ ] **Step 4: Run tests — expect PASS**

Run: `cd app && bun test src/main/agents/settings.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit (only if user asked)**

```bash
git add app/src/types/domain.d.ts app/src/main/agents/types.ts app/src/main/settings.ts app/src/main/agents/settings.ts app/src/main/agents/settings.test.ts
git commit -m "feat(agents): add Phase 2 Knowledge model settings"
```

---

### Task 2: Preferential complexity

**Files:**
- Modify: `src/main/agents/complexity.ts`
- Modify: `src/main/agents/complexity.test.ts`

**Interfaces:**
- Consumes: existing `ComplexityInput`
- Produces: `isPreferentialKnowledge(text: string): boolean`; `leanComplexity` returns `"complex"` when preferential

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, expect, test } from "bun:test";
import { isPreferentialKnowledge, leanComplexity } from "./complexity";

describe("isPreferentialKnowledge", () => {
  test("research", () => {
    expect(isPreferentialKnowledge("Research the latest Next.js app router docs")).toBe(true);
  });
  test("fact check", () => {
    expect(isPreferentialKnowledge("Fact check these claims about Ollama")).toBe(true);
  });
  test("summarize", () => {
    expect(isPreferentialKnowledge("Summarize the key points from this article")).toBe(true);
  });
  test("document", () => {
    expect(isPreferentialKnowledge("Write a PDF brief on local LLM tooling")).toBe(true);
  });
  test("plain Q&A false", () => {
    expect(isPreferentialKnowledge("What is 2+2?")).toBe(false);
  });
});

describe("leanComplexity preferential", () => {
  test("research phrase is complex even without tools", () => {
    expect(
      leanComplexity({
        text: "Research current Vite create-app options",
        useTools: false,
        hasProject: false,
        hasAttachments: false,
      })
    ).toBe("complex");
  });
});
```

Keep existing complexity tests passing.

- [ ] **Step 2: Run — expect FAIL**

Run: `cd app && bun test src/main/agents/complexity.test.ts`  
Expected: FAIL (`isPreferentialKnowledge` missing)

- [ ] **Step 3: Minimal implementation**

```typescript
const RESEARCH_RE =
  /\b(research|look up|find sources|what does the web say|investigate)\b/i;
const FACT_CHECK_RE = /\b(verify|fact[- ]?check|is this true|cross[- ]?check)\b/i;
const SUMMARIZE_RE = /\b(summarize|tl;?dr|brief me on|condense)\b/i;
const DOCUMENT_RE =
  /\b(write|generate|draft)\b.*\b(pdf|docx|report|brief|memo|document)\b|\b(pdf|docx)\b.*\b(brief|report)\b/i;

export function isPreferentialKnowledge(text: string): boolean {
  const t = (text || "").trim();
  if (!t) return false;
  return (
    RESEARCH_RE.test(t) ||
    FACT_CHECK_RE.test(t) ||
    SUMMARIZE_RE.test(t) ||
    DOCUMENT_RE.test(t)
  );
}

export function leanComplexity(input: ComplexityInput): ComplexityLean {
  if (isPreferentialKnowledge(input.text)) return "complex";
  // ... existing body unchanged ...
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `cd app && bun test src/main/agents/complexity.test.ts`  
Expected: PASS (including prior cases)

- [ ] **Step 5: Commit (only if user asked)**

```bash
git add app/src/main/agents/complexity.ts app/src/main/agents/complexity.test.ts
git commit -m "feat(agents): preferential Knowledge complexity gate"
```

---

### Task 3: Plan parse + planner prompt

**Files:**
- Modify: `src/main/agents/plan.ts`
- Modify: `src/main/agents/plan.test.ts` (add cases if file exists; else create)
- Modify: `src/main/agents/planner.ts`
- Modify: `src/main/agents/planner.test.ts` (assert prompt contains new kinds / bias)

**Interfaces:**
- Consumes: extended `AgentStepKind`
- Produces: `parsePlan` accepts new kinds; `planTurn({ ..., preferentialKnowledge?: boolean })`

- [ ] **Step 1: Failing tests**

```typescript
// plan.test.ts
test("parses research kind", () => {
  const plan = parsePlan(
    JSON.stringify({
      steps: [{ id: "1", goal: "Look up docs", dependsOn: [], kind: "research" }],
    })
  );
  expect(plan?.steps[0].kind).toBe("research");
});

test("parses fact_check summarize document", () => {
  const plan = parsePlan(
    JSON.stringify({
      steps: [
        { id: "1", goal: "a", dependsOn: [], kind: "fact_check" },
        { id: "2", goal: "b", dependsOn: [], kind: "summarize" },
        { id: "3", goal: "c", dependsOn: [], kind: "document" },
      ],
    })
  );
  expect(plan?.steps.map((s) => s.kind)).toEqual([
    "fact_check",
    "summarize",
    "document",
  ]);
});
```

```typescript
// planner.test.ts — prompt content via capturing generate
test("prompt lists Knowledge kinds", async () => {
  let prompt = "";
  await planTurn({
    model: "m",
    userText: "Research X",
    preferentialKnowledge: true,
    generate: async (_m, p) => {
      prompt = p;
      return JSON.stringify({
        steps: [{ id: "1", goal: "Research X", dependsOn: [], kind: "research" }],
      });
    },
  });
  expect(prompt).toMatch(/research/);
  expect(prompt).toMatch(/fact_check/);
  expect(prompt).toMatch(/Prefer Knowledge/i);
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `cd app && bun test src/main/agents/plan.test.ts src/main/agents/planner.test.ts`

- [ ] **Step 3: Implementation**

`plan.ts`:

```typescript
const VALID_KINDS = new Set<AgentStepKind>([
  "memory",
  "retrieve",
  "tool",
  "synthesize",
  "research",
  "fact_check",
  "summarize",
  "document",
]);
```

`planner.ts` — update PLAN_PROMPT / REPAIR_PROMPT kind union string to include the four. When `preferentialKnowledge` is true, append:

```
Prefer Knowledge step kinds when they fit: research (web/docs lookup), fact_check (verify claims), summarize (compress findings), document (generate_document). Prefer research before answering factual current-events questions.
```

Extend `planTurn` opts with `preferentialKnowledge?: boolean`.

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit (only if user asked)**

```bash
git add app/src/main/agents/plan.ts app/src/main/agents/plan.test.ts app/src/main/agents/planner.ts app/src/main/agents/planner.test.ts
git commit -m "feat(agents): parse and plan Phase 2 Knowledge kinds"
```

---

### Task 4: Router kind assignment

**Files:**
- Modify: `src/main/agents/router.ts`
- Create or modify: `src/main/agents/router.test.ts`

**Interfaces:**
- Consumes: `AgentPlan` with optional planned kinds
- Produces: `assignKinds(plan)` using Knowledge patterns; preserves non-`tool` planned kinds when patterns say `tool`

- [ ] **Step 1: Failing tests**

```typescript
import { describe, expect, test } from "bun:test";
import { assignKinds } from "./router";

test("research goal", () => {
  const p = assignKinds({
    steps: [{ id: "1", goal: "Research official Vite docs online", dependsOn: [], kind: "tool" }],
  });
  expect(p.steps[0].kind).toBe("research");
});

test("fact_check goal", () => {
  const p = assignKinds({
    steps: [{ id: "1", goal: "Fact check the claims from step 1", dependsOn: ["1"], kind: "tool" }],
  });
  expect(p.steps[0].kind).toBe("fact_check");
});

test("summarize goal", () => {
  const p = assignKinds({
    steps: [{ id: "1", goal: "Summarize the worker findings", dependsOn: [], kind: "tool" }],
  });
  expect(p.steps[0].kind).toBe("summarize");
});

test("document goal", () => {
  const p = assignKinds({
    steps: [{ id: "1", goal: "Generate a PDF brief with generate_document", dependsOn: [], kind: "tool" }],
  });
  expect(p.steps[0].kind).toBe("document");
});

test("keeps planned research when patterns miss", () => {
  const p = assignKinds({
    steps: [{ id: "1", goal: "Collect current options for X", dependsOn: [], kind: "research" }],
  });
  expect(p.steps[0].kind).toBe("research");
});

test("retrieve still works", () => {
  const p = assignKinds({
    steps: [{ id: "1", goal: "Search the project documents for auth", dependsOn: [], kind: "tool" }],
  });
  expect(p.steps[0].kind).toBe("retrieve");
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `cd app && bun test src/main/agents/router.test.ts`

- [ ] **Step 3: Implementation**

```typescript
const RESEARCH_PATTERN = /\bresearch\b|look up|find sources|web search|official docs/i;
const FACT_CHECK_PATTERN = /\bfact[- ]?check\b|\bverify (the )?claims?\b|\bcross[- ]?check\b/i;
const SUMMARIZE_PATTERN = /\bsummarize\b|\btl;?dr\b|\bcondense\b|\bbrief (me )?on\b/i;
const DOCUMENT_PATTERN =
  /\bgenerate_document\b|\b(pdf|docx)\b.*\b(brief|report|memo)\b|\bwrite (a )?(pdf|docx|report|brief|memo)\b/i;
// keep existing RETRIEVE / MEMORY / SYNTHESIZE patterns

function kindFromPatterns(goal: string): AgentStepKind {
  if (RESEARCH_PATTERN.test(goal)) return "research";
  if (FACT_CHECK_PATTERN.test(goal)) return "fact_check";
  if (SUMMARIZE_PATTERN.test(goal)) return "summarize";
  if (DOCUMENT_PATTERN.test(goal)) return "document";
  if (RETRIEVE_PATTERN.test(goal)) return "retrieve";
  if (MEMORY_PATTERN.test(goal)) return "memory";
  if (SYNTHESIZE_PATTERN.test(goal)) return "synthesize";
  return "tool";
}

function resolveKind(goal: string, planned: AgentStepKind): AgentStepKind {
  const fromGoal = kindFromPatterns(goal);
  if (fromGoal !== "tool") return fromGoal;
  if (planned && planned !== "tool") return planned;
  return "tool";
}

export function assignKinds(plan: AgentPlan): AgentPlan {
  return {
    steps: plan.steps.map((step) => ({
      ...step,
      kind: resolveKind(step.goal, step.kind),
    })),
  };
}
```

Order matters: Knowledge patterns before retrieve so “research project docs online” → research (web), while “search the project documents” → retrieve.

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit (only if user asked)**

```bash
git add app/src/main/agents/router.ts app/src/main/agents/router.test.ts
git commit -m "feat(agents): route Phase 2 Knowledge step kinds"
```

---

### Task 5: Soft fact-check insert

**Files:**
- Create: `src/main/agents/fact-check-insert.ts`
- Create: `src/main/agents/fact-check-insert.test.ts`

**Interfaces:**
- Produces: `insertFactChecks(plan: AgentPlan, userText: string, maxSteps = 6): AgentPlan`

- [ ] **Step 1: Failing tests**

```typescript
import { describe, expect, test } from "bun:test";
import { insertFactChecks } from "./fact-check-insert";
import type { AgentPlan } from "./types";

const researchPlan = (): AgentPlan => ({
  steps: [
    { id: "1", goal: "Research X", dependsOn: [], kind: "research" },
    { id: "2", goal: "Write reply", dependsOn: ["1"], kind: "synthesize" },
  ],
});

test("inserts fact_check after research", () => {
  const out = insertFactChecks(researchPlan(), "Research X thoroughly");
  expect(out.steps.some((s) => s.kind === "fact_check")).toBe(true);
  const fc = out.steps.find((s) => s.kind === "fact_check")!;
  expect(fc.dependsOn).toEqual(["1"]);
});

test("skips when fact_check already depends on research", () => {
  const plan: AgentPlan = {
    steps: [
      { id: "1", goal: "Research X", dependsOn: [], kind: "research" },
      { id: "2", goal: "Verify", dependsOn: ["1"], kind: "fact_check" },
    ],
  };
  const out = insertFactChecks(plan, "Research and verify X");
  expect(out.steps.filter((s) => s.kind === "fact_check")).toHaveLength(1);
});

test("skips fetch-only", () => {
  const out = insertFactChecks(researchPlan(), "Just fetch the URL https://example.com");
  expect(out.steps.some((s) => s.kind === "fact_check")).toBe(false);
});

test("skips when at max steps", () => {
  const steps = Array.from({ length: 6 }, (_, i) => ({
    id: String(i + 1),
    goal: i === 0 ? "Research X" : `Step ${i}`,
    dependsOn: [] as string[],
    kind: (i === 0 ? "research" : "tool") as const,
  }));
  const out = insertFactChecks({ steps }, "Research X");
  expect(out.steps).toHaveLength(6);
  expect(out.steps.some((s) => s.kind === "fact_check")).toBe(false);
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `cd app && bun test src/main/agents/fact-check-insert.test.ts`

- [ ] **Step 3: Implementation**

```typescript
import type { AgentPlan, AgentStep } from "./types";

const FETCH_ONLY_RE =
  /\b(just fetch|only fetch|fetch (the )?(page|url) only|download (the )?(page|url))\b/i;

const MAX_STEPS_DEFAULT = 6;

export function insertFactChecks(
  plan: AgentPlan,
  userText: string,
  maxSteps = MAX_STEPS_DEFAULT
): AgentPlan {
  if (FETCH_ONLY_RE.test(userText || "")) return plan;

  const steps = [...plan.steps];
  const researchIds = steps.filter((s) => s.kind === "research").map((s) => s.id);

  for (const rid of researchIds) {
    if (steps.length >= maxSteps) break;
    const hasFc = steps.some(
      (s) => s.kind === "fact_check" && s.dependsOn.includes(rid)
    );
    if (hasFc) continue;

    const id = `fc-${rid}`;
    if (steps.some((s) => s.id === id)) continue;

    const fc: AgentStep = {
      id,
      goal: `Fact check claims from step ${rid}`,
      dependsOn: [rid],
      kind: "fact_check",
    };
    // Insert before synthesize steps when possible; else append
    const synthIdx = steps.findIndex((s) => s.kind === "synthesize");
    if (synthIdx >= 0) steps.splice(synthIdx, 0, fc);
    else steps.push(fc);
  }

  return { steps };
}
```

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit (only if user asked)**

```bash
git add app/src/main/agents/fact-check-insert.ts app/src/main/agents/fact-check-insert.test.ts
git commit -m "feat(agents): soft-insert fact_check after research"
```

---

### Task 6: Specialist prompts, allowlists, labels

**Files:**
- Create: `src/main/agents/specialists/prompts.ts`
- Create: `src/main/agents/specialists/prompts.test.ts`
- Create: `src/main/agents/specialists/allowlists.ts`
- Create: `src/main/agents/specialists/allowlists.test.ts`
- Create: `src/main/agents/specialists/labels.ts`
- Create: `src/main/agents/specialists/labels.test.ts`

**Interfaces:**
- Produces:
  - `specialistPrompt(kind: KnowledgeKind): string`
  - `allowlistFor(kind): string[] | null` — `null` means no filter (generic tool)
  - `filterToolDefs(defs: OllamaToolDef[] | null, allow: string[] | null): OllamaToolDef[] | null`
  - `labelForStepKind(kind: string): string`

KnowledgeKind = `research | fact_check | summarize | document`.

- [ ] **Step 1: Failing tests**

```typescript
// allowlists.test.ts
test("research allowlist includes web_search and http_fetch", () => {
  expect(allowlistFor("research")).toEqual(
    expect.arrayContaining(["web_search", "http_fetch"])
  );
});

test("summarize has empty allowlist meaning no tools", () => {
  expect(allowlistFor("summarize")).toEqual([]);
});

test("filterToolDefs keeps only allowlisted", () => {
  const defs = [
    { type: "function", function: { name: "web_search", description: "", parameters: {} } },
    { type: "function", function: { name: "run_shell", description: "", parameters: {} } },
  ] as OllamaToolDef[];
  const filtered = filterToolDefs(defs, ["web_search"]);
  expect(filtered?.map((d) => d.function.name)).toEqual(["web_search"]);
});

// prompts.test.ts
test("research prompt forbids pasting full pages", () => {
  expect(specialistPrompt("research")).toMatch(/sources/i);
});

test("fact_check prompt requires supported disputed unknown", () => {
  expect(specialistPrompt("fact_check")).toMatch(/disputed/i);
});

// labels.test.ts
test("labels", () => {
  expect(labelForStepKind("research")).toBe("Research");
  expect(labelForStepKind("fact_check")).toBe("Fact check");
  expect(labelForStepKind("summarize")).toBe("Summarize");
  expect(labelForStepKind("document")).toBe("Document");
  expect(labelForStepKind("memory")).toBe("memory");
});
```

Adjust `OllamaToolDef` shape to match the repo.

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implementation**

```typescript
// allowlists.ts
export function allowlistFor(
  kind: "research" | "fact_check" | "summarize" | "document"
): string[] | null {
  if (kind === "research") return ["web_search", "http_fetch"];
  if (kind === "fact_check") return ["http_fetch"];
  if (kind === "summarize") return []; // no tools
  if (kind === "document") return ["generate_document", "web_search", "http_fetch", "read_file"];
  return null;
}

export function filterToolDefs(
  defs: OllamaToolDef[] | null,
  allow: string[] | null
): OllamaToolDef[] | null {
  if (!defs) return null;
  if (allow === null) return defs;
  if (allow.length === 0) return null; // force no-tools loop
  const set = new Set(allow);
  const filtered = defs.filter((d) => set.has(d.function.name));
  return filtered.length ? filtered : null;
}
```

Prompts: short specialist system strings per spec (research gather+cite; fact_check supported/disputed/unknown; summarize compress; document use generate_document, no full source dump in chat).

```typescript
// labels.ts
const LABELS: Record<string, string> = {
  research: "Research",
  fact_check: "Fact check",
  summarize: "Summarize",
  document: "Document",
};
export function labelForStepKind(kind: string): string {
  return LABELS[kind] || kind;
}
```

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit (only if user asked)**

```bash
git add app/src/main/agents/specialists/
git commit -m "feat(agents): Knowledge specialist prompts and allowlists"
```

---

### Task 7: Workers dispatch for Knowledge kinds

**Files:**
- Modify: `src/main/agents/workers.ts`
- Modify: `src/main/agents/workers.test.ts`

**Interfaces:**
- Consumes: `specialistPrompt`, `allowlistFor`, `filterToolDefs`, `modelForStepKind` (via deps)
- Extends `WorkersDeps` with:
  - `modelForKind: (kind: AgentStepKind) => string`
  - Optional: keep `toolModel` as default for `"tool"`

- [ ] **Step 1: Failing tests**

Add a test that `makeWorkers` for `kind: "summarize"` calls `chat` with **null/empty tools** and the summarize system prompt, and uses `modelForKind("summarize")`.

Add a test that `research` passes filtered tool defs containing only allowlisted names.

Follow existing workers.test.ts injection style (`chat`, `execTool`, …).

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implementation**

Refactor `runTool` to accept overrides:

```typescript
async function runTool(
  step: AgentStep,
  deps: WorkersDeps,
  confirm: ConfirmFn,
  ask: AskFn,
  opts: {
    model: string;
    toolDefs: OllamaToolDef[] | null;
    specialistSystem: string;
  }
): Promise<ToolRunOutput>
```

Use `opts.specialistSystem` instead of the generic worker sentence when provided.

In `makeWorkers` switch:

```typescript
case "memory": ...
case "retrieve": ...
case "research":
case "fact_check":
case "summarize":
case "document": {
  const allow = allowlistFor(step.kind);
  const toolDefs = filterToolDefs(deps.toolDefs, allow);
  const r = await runTool(step, deps, serialConfirm, serialAsk, {
    model: deps.modelForKind(step.kind),
    toolDefs,
    specialistSystem: specialistPrompt(step.kind),
  });
  ...
}
default: // tool + any unknown
  await runTool(..., { model: deps.modelForKind("tool"), toolDefs: deps.toolDefs, specialistSystem: GENERIC });
```

For `summarize` / empty allowlist: `toolDefs` null → LLM-only rounds (existing break-when-no-calls path).

- [ ] **Step 4: Run — expect PASS**

Run: `cd app && bun test src/main/agents/workers.test.ts`

- [ ] **Step 5: Commit (only if user asked)**

```bash
git add app/src/main/agents/workers.ts app/src/main/agents/workers.test.ts
git commit -m "feat(agents): run Knowledge specialist workers"
```

---

### Task 8: Orchestrator insert + ipc wiring

**Files:**
- Modify: `src/main/agents/orchestrator.ts`
- Modify: `src/main/agents/orchestrator.test.ts`
- Modify: `src/main/ipc.ts`

**Interfaces:**
- Orchestrator: after `assignKinds`, apply `insertFactChecks(assigned, userText)` before emitting `agent:plan`
- ipc: pass `preferentialKnowledge: isPreferentialKnowledge(lastText)` into `planTurn`; pass `modelForKind` into `makeWorkers`; strengthen synthesize system note

- [ ] **Step 1: Failing orchestrator test**

Mock `assignKinds` to return a research step; assert `act` plan event includes a `fact_check` step (orchestrator calls insert internally — either hardcode import or inject `insertFactChecks` dep; prefer **direct import** of pure helper to avoid API churn).

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Orchestrator change**

```typescript
import { insertFactChecks } from "./fact-check-insert";

// inside runOrchestratedTurn, after assignKinds:
const assigned = insertFactChecks(deps.assignKinds(plan), userText);
```

Ensure `agent:plan` uses `assigned.steps`.

- [ ] **Step 4: ipc wiring**

```typescript
import { isPreferentialKnowledge } from "./agents/complexity";
import { modelForStepKind } from "./agents/settings";

const runStep = makeWorkers({
  ...
  toolModel: modelForRole(agentCfg, "toolExecutor", useModel),
  modelForKind: (kind) => modelForStepKind(agentCfg, kind, useModel),
});

planTurn: () =>
  planTurn({
    model: modelForRole(agentCfg, "planner", useModel),
    userText: lastText,
    preferentialKnowledge: isPreferentialKnowledge(lastText),
    generate: trackedGenerate,
  }),
```

Synthesize system content — append:

```
If any worker reported disputed or unknown claims, surface that uncertainty clearly in the final reply. Do not invent citations.
```

Keep `if (projectCoding) useMulti = false` unchanged (already present).

- [ ] **Step 5: Run agent + settings tests**

Run: `cd app && bun test src/main/agents/`  
Expected: PASS

- [ ] **Step 6: Commit (only if user asked)**

```bash
git add app/src/main/agents/orchestrator.ts app/src/main/agents/orchestrator.test.ts app/src/main/ipc.ts
git commit -m "feat(agents): wire Phase 2 Knowledge into orchestrator and chat"
```

---

### Task 9: Settings UI

**Files:**
- Modify: `src/renderer/index.html` (Agents section model rows)
- Modify: `src/renderer/js/settings.ts`

**Interfaces:**
- Consumes: extended `AgentModelMap` keys `research`, `factCheck`, `summarize`, `document`

- [ ] **Step 1: Add four `<select>` rows** after Synthesize model:

```html
<div class="setting-row">
  <div class="label">Research model</div>
  <select id="agents-model-research"><option value="">Same as chat</option></select>
</div>
<div class="setting-row">
  <div class="label">Fact check model</div>
  <select id="agents-model-factcheck"><option value="">Same as chat</option></select>
</div>
<div class="setting-row">
  <div class="label">Summarize model</div>
  <select id="agents-model-summarize"><option value="">Same as chat</option></select>
</div>
<div class="setting-row">
  <div class="label">Document writer model</div>
  <select id="agents-model-document"><option value="">Same as chat</option></select>
</div>
```

- [ ] **Step 2: Extend `AGENT_MODEL_SELECTS`**

```typescript
const AGENT_MODEL_SELECTS: { id: string; key: keyof AgentModelMap }[] = [
  { id: "agents-model-planner", key: "planner" },
  { id: "agents-model-router", key: "router" },
  { id: "agents-model-tool", key: "toolExecutor" },
  { id: "agents-model-synth", key: "synthesize" },
  { id: "agents-model-research", key: "research" },
  { id: "agents-model-factcheck", key: "factCheck" },
  { id: "agents-model-summarize", key: "summarize" },
  { id: "agents-model-document", key: "document" },
];
```

Confirm paint/save loops already iterate this array.

- [ ] **Step 3: Manual / typecheck**

Run: `cd app && bun run typecheck` (or project’s existing typecheck script)  
Expected: PASS

- [ ] **Step 4: Commit (only if user asked)**

```bash
git add app/src/renderer/index.html app/src/renderer/js/settings.ts
git commit -m "feat(settings): Knowledge specialist model picks"
```

---

### Task 10: Trail labels + marketing flag

**Files:**
- Modify: `src/renderer/js/agent-trail.ts`
- Modify: `src/renderer/js/agent-trail.test.ts`
- Modify: `src/renderer/js/turns.ts` (running status line uses stepKind)
- Modify: `web/components/home/capabilities.data.ts`
- Modify: `web/components/home/capabilities.data.test.ts` if it asserts upcoming count

**Interfaces:**
- Prefer duplicating a tiny label map in the renderer **or** export labels via a shared string table. To avoid cross-root imports from `app/src/main` into renderer, **copy** the four labels into `agent-trail.ts` (keep in sync with `specialists/labels.ts`) — note in comment.

- [ ] **Step 1: Failing trail test**

```typescript
test("shows Research label", () => {
  const summary = summarizeAgentTrail([
    {
      kind: "agent:plan",
      steps: [{ id: "1", goal: "Look up X", stepKind: "research" }],
    },
    {
      kind: "agent:step",
      id: "1",
      goal: "Look up X",
      stepKind: "research",
      parallelGroup: 1,
      status: "done",
    },
  ]);
  expect(summary?.lines[0]).toContain("Research");
});
```

- [ ] **Step 2: Implement label helper in agent-trail + turns**

```typescript
function stepKindLabel(kind: string): string {
  if (kind === "research") return "Research";
  if (kind === "fact_check") return "Fact check";
  if (kind === "summarize") return "Summarize";
  if (kind === "document") return "Document";
  return kind;
}
// use in line: `(${stepKindLabel(s.stepKind)})`
```

In `turns.ts` sticky/running copy, wrap `ev.stepKind` the same way (inline duplicate or small `agent-labels.ts` under renderer).

- [ ] **Step 3: Marketing**

In `capabilities.data.ts`, remove `upcoming: true` from **Research specialist** (or rename description to shipped Phase 2 Research). Keep Slack / marketplace / shared skills as upcoming.

Update `capabilities.data.test.ts` upcoming count if it assumes `>= 4` — Research no longer upcoming, so expect `>= 3` or count exactly.

- [ ] **Step 4: Run tests**

Run: `cd app && bun test src/renderer/js/agent-trail.test.ts`  
Run: `cd web &&` project’s test command for `capabilities.data.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit (only if user asked)**

```bash
git add app/src/renderer/js/agent-trail.ts app/src/renderer/js/agent-trail.test.ts app/src/renderer/js/turns.ts web/components/home/capabilities.data.ts web/components/home/capabilities.data.test.ts
git commit -m "feat: label Knowledge steps and mark Research shipped"
```

---

### Task 11: Regression + manual verification

**Files:** none required (checklist)

- [ ] **Step 1: Full agents unit suite**

Run: `cd app && bun test src/main/agents/`  
Expected: all PASS

- [ ] **Step 2: Spec coverage checklist**

| Spec requirement | Task |
|------------------|------|
| Four new kinds | 1, 3, 4, 7 |
| Preferential activation | 2, 8 |
| Soft fact_check insert + cap + fetch-only | 5, 8 |
| Specialist allowlists/prompts | 6, 7 |
| Settings models + fallbacks | 1, 9 |
| Trail labels | 10 |
| Coding path wins | 8 (existing gate) |
| No re-research loop | 6/7 prompts + synthesize note only |
| Marketing Research shipped | 10 |

- [ ] **Step 3: Manual smoke**

1. Agents on — “Research the latest Ollama tool calling docs and cite sources” → plan shows Research + Fact check → one synthesized answer  
2. “Just fetch https://example.com” → no forced fact_check insert  
3. “Write a PDF brief on local RAG” with tools on → Document step / file card  
4. Agents off → single-agent  
5. “Scaffold a Vite React app” with tools on → project-first, not multi-agent Knowledge  

- [ ] **Step 4: Commit docs only if user asked** (plan/spec already on disk)

---

## Self-review (plan author)

**Spec coverage:** Preferential gate, four kinds, soft fact-check, specialists, settings, ipc/orchestrator wiring, trail labels, coding precedence, marketing flag — each maps to a task. Phase 3–5 and re-research loops explicitly out of scope.

**Placeholders:** None intentional; worker tool-def shapes must match existing `OllamaToolDef` in tests (copy from current workers tests).

**Type consistency:** `fact_check` step kind vs `factCheck` settings key is intentional (kind uses snake; settings map uses camelCase like `toolExecutor`). `modelForStepKind` bridges them. `insertFactChecks` max 6 matches planner cap.
