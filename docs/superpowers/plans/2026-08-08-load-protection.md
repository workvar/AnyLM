# Load Protection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Soft-stop the active chat turn and force `maxParallel = 1` when machine-wide system RAM used stays over a configurable kill % (default 90), sampling only at turn/wave boundaries plus a ~2s in-flight sustained check — without killing Ollama or the app.

**Architecture:** Pure helpers under `app/src/main/load-guard/` own RAM sampling and pressure decisions (injectable sampler; fail open). `resolveAgentSettings` exposes `agents.loadProtection.{enabled,killPercent}`. `ipc.ts` samples before turn start and runs a short sustained monitor while a turn is in flight, soft-stopping via the existing `cancelledChats` / `chat:cancel` path. `orchestrator.ts` re-samples before each wave to pass `maxParallel: 1` and soft-stop when over. Settings → Agents gains a Load protection block; the renderer shows a one-line memory stop reason on the bubble.

**Tech Stack:** Electron main/renderer TypeScript, Node `os.totalmem` / `os.freemem` (injectable), Bun tests (`bun:test`), existing `settings` JSON merge, `cancelledChats` soft-stop, `runOrchestratedTurn` wave loop.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-08-load-protection-design.md`
- Kill action: soft-stop the current turn only (same path as Stop / `chat:cancel` → `cancelledChats`); Ollama and the app stay up
- Memory metric: system RAM used % (machine-wide); never invent a “100%” reading on failure
- At kill line: drop `maxParallel` to 1 **and** soft-stop together (same threshold); no earlier warn/throttle band
- Defaults: `agents.loadProtection.enabled = true`, `killPercent = 90`, clamp **50–99**
- Sampling only: before turn start, before each multi-agent wave, ~2s sustained check while a turn is in flight — no always-on idle watchdog
- Sample failure → **fail open** (do not stop; do not force `maxParallel=1`); log once per turn (or rate-limited)
- Do not unload/kill Ollama; do not change default `agents.maxParallel` (remains 2)
- No flaky live system-RAM tests in CI — always inject a fake sampler
- Prefer pure, testable modules under `load-guard/`; keep `ipc.ts` / orchestrator wiring thin
- Commit steps run only when the user explicitly asks to commit (user rule); otherwise skip commits and leave changes unstaged

## File map

| File | Responsibility |
|------|----------------|
| `app/src/main/load-guard/clamp.ts` | `clampKillPercent` (50–99, default 90) |
| `app/src/main/load-guard/clamp.test.ts` | Clamp / invalid / missing cases |
| `app/src/main/load-guard/system-memory.ts` | Injectable machine-wide used RAM % (`null` = fail open) |
| `app/src/main/load-guard/system-memory.test.ts` | % math + fail-open on bad totals |
| `app/src/main/load-guard/guard.ts` | `isOverKillLimit`, `effectiveMaxParallel`, sustained trip helper + in-flight monitor factory |
| `app/src/main/load-guard/guard.test.ts` | Over/under, disabled, fail-open, sustained two-sample trip |
| `app/src/main/agents/types.ts` + `app/src/types/domain.d.ts` | `LoadProtectionSettings` on `AgentSettings` |
| `app/src/main/settings.ts` | Defaults + deep-merge `agents.loadProtection` on write |
| `app/src/main/agents/settings.ts` | `resolveAgentSettings` returns clamped loadProtection |
| `app/src/main/agents/settings.test.ts` | Resolve defaults / clamp / enabled |
| `app/src/main/agents/orchestrator.ts` | Before each wave: optional `beforeWave` → maxParallel + soft-stop |
| `app/src/main/agents/orchestrator.test.ts` | Wave uses maxParallel 1 + soft when beforeWave says over |
| `app/src/main/ipc.ts` | Turn-start sample, in-flight monitor, wire orchestrator `beforeWave`, `stopReason` on `chat:done` |
| `app/preload.ts` + `app/src/types/api.d.ts` | Surface `stopReason` / `killPercent` from chat resolve |
| `app/src/renderer/index.html` + `styles.css` | Load protection toggle + % under Agents |
| `app/src/renderer/js/settings.ts` | Paint/bind load protection controls |
| `app/src/renderer/js/turns.ts` | Bubble label: `Stopped: system memory over N%` |

Paths below for `app/` sources are relative to `app/` unless noted.

---

### Task 1: Kill % clamp helper

**Files:**
- Create: `src/main/load-guard/clamp.ts`
- Create: `src/main/load-guard/clamp.test.ts`

**Interfaces:**
- Produces: `clampKillPercent(n: unknown, fallback?: number): number` — integer in **50–99**; invalid/missing → `fallback` (default **90**)

- [ ] **Step 1: Write the failing tests**

```typescript
// src/main/load-guard/clamp.test.ts
import { describe, expect, test } from "bun:test";
import { clampKillPercent } from "./clamp";

describe("clampKillPercent", () => {
  test("defaults undefined/null to 90", () => {
    expect(clampKillPercent(undefined)).toBe(90);
    expect(clampKillPercent(null)).toBe(90);
  });

  test("clamps below 50 up to 50", () => {
    expect(clampKillPercent(0)).toBe(50);
    expect(clampKillPercent(49)).toBe(50);
  });

  test("clamps above 99 down to 99", () => {
    expect(clampKillPercent(100)).toBe(99);
    expect(clampKillPercent(150)).toBe(99);
  });

  test("passes through valid values and rounds", () => {
    expect(clampKillPercent(90)).toBe(90);
    expect(clampKillPercent(75.4)).toBe(75);
    expect(clampKillPercent(75.6)).toBe(76);
  });

  test("invalid values fall back to default", () => {
    expect(clampKillPercent("nope")).toBe(90);
    expect(clampKillPercent(NaN)).toBe(90);
  });

  test("honors custom fallback then clamps", () => {
    expect(clampKillPercent(undefined, 80)).toBe(80);
    expect(clampKillPercent(10, 80)).toBe(50);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && bun test src/main/load-guard/clamp.test.ts`  
Expected: FAIL (module not found)

- [ ] **Step 3: Minimal implementation**

```typescript
// src/main/load-guard/clamp.ts
const DEFAULT_KILL = 90;
const MIN_KILL = 50;
const MAX_KILL = 99;

/** Integer kill % in 50–99; invalid/missing → fallback (default 90). */
export function clampKillPercent(n: unknown, fallback = DEFAULT_KILL): number {
  const base = Number.isFinite(Number(fallback)) ? Number(fallback) : DEFAULT_KILL;
  const num = Number(n ?? base);
  if (!Number.isFinite(num)) {
    return Math.min(MAX_KILL, Math.max(MIN_KILL, Math.round(base)));
  }
  return Math.min(MAX_KILL, Math.max(MIN_KILL, Math.round(num)));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd app && bun test src/main/load-guard/clamp.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit (only if user asked)**

```bash
git add app/src/main/load-guard/clamp.ts app/src/main/load-guard/clamp.test.ts
git commit -m "feat: add load-protection killPercent clamp"
```

---

### Task 2: System RAM used % sampler

**Files:**
- Create: `src/main/load-guard/system-memory.ts`
- Create: `src/main/load-guard/system-memory.test.ts`

**Interfaces:**
- Produces:
  - `type MemorySampleDeps = { totalmem: () => number; freemem: () => number }`
  - `systemRamUsedPercent(deps?: MemorySampleDeps): number | null` — used % 0–100, or `null` on failure (fail open)

- [ ] **Step 1: Write the failing tests**

```typescript
// src/main/load-guard/system-memory.test.ts
import { describe, expect, test } from "bun:test";
import { systemRamUsedPercent } from "./system-memory";

describe("systemRamUsedPercent", () => {
  test("computes used percent from total/free", () => {
    const pct = systemRamUsedPercent({
      totalmem: () => 1000,
      freemem: () => 100,
    });
    expect(pct).toBe(90);
  });

  test("rounds to nearest int", () => {
    const pct = systemRamUsedPercent({
      totalmem: () => 1000,
      freemem: () => 333,
    });
    expect(pct).toBe(67);
  });

  test("clamps free > total to 0% used", () => {
    const pct = systemRamUsedPercent({
      totalmem: () => 1000,
      freemem: () => 2000,
    });
    expect(pct).toBe(0);
  });

  test("fail open on zero/negative total", () => {
    expect(systemRamUsedPercent({ totalmem: () => 0, freemem: () => 0 })).toBeNull();
    expect(systemRamUsedPercent({ totalmem: () => -1, freemem: () => 0 })).toBeNull();
  });

  test("fail open when deps throw", () => {
    expect(
      systemRamUsedPercent({
        totalmem: () => {
          throw new Error("boom");
        },
        freemem: () => 1,
      })
    ).toBeNull();
  });

  test("fail open on non-finite values", () => {
    expect(systemRamUsedPercent({ totalmem: () => NaN, freemem: () => 1 })).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && bun test src/main/load-guard/system-memory.test.ts`  
Expected: FAIL (module not found)

- [ ] **Step 3: Minimal implementation**

```typescript
// src/main/load-guard/system-memory.ts
import * as os from "os";

export type MemorySampleDeps = {
  totalmem: () => number;
  freemem: () => number;
};

/** Machine-wide RAM used %. Returns null on failure (callers must fail open). */
export function systemRamUsedPercent(deps?: MemorySampleDeps): number | null {
  const totalmem = deps?.totalmem ?? os.totalmem;
  const freemem = deps?.freemem ?? os.freemem;
  try {
    const total = totalmem();
    const free = freemem();
    if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(free)) return null;
    const used = Math.max(0, Math.min(total, total - free));
    return Math.round((used / total) * 100);
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd app && bun test src/main/load-guard/system-memory.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit (only if user asked)**

```bash
git add app/src/main/load-guard/system-memory.ts app/src/main/load-guard/system-memory.test.ts
git commit -m "feat: add injectable system RAM used% sampler"
```

---

### Task 3: Load guard decisions + sustained trip

**Files:**
- Create: `src/main/load-guard/guard.ts`
- Create: `src/main/load-guard/guard.test.ts`

**Interfaces:**
- Consumes: `clampKillPercent` (Task 1); sampler returns `number | null` (Task 2)
- Produces:
  - `isOverKillLimit(usedPercent: number | null, killPercent: number): boolean` — `null` → false (fail open)
  - `effectiveMaxParallel(configured: number, opts: { enabled: boolean; overKill: boolean }): number` — returns `1` only when enabled and over; else configured
  - `type SustainedPressure = { prevOver: boolean }`
  - `nextSustainedPressure(state: SustainedPressure, sample: number | null, killPercent: number): { state: SustainedPressure; trip: boolean; over: boolean }` — two consecutive overs → `trip`; spike then under → no trip; null sample → fail open (clear over, no trip)
  - `createInFlightMonitor(opts): { start(): void; stop(): void }` — polls ~every `intervalMs` (default 2000); on `trip` calls `onTrip` once

- [ ] **Step 1: Write the failing tests**

```typescript
// src/main/load-guard/guard.test.ts
import { describe, expect, test } from "bun:test";
import {
  createInFlightMonitor,
  effectiveMaxParallel,
  isOverKillLimit,
  nextSustainedPressure,
} from "./guard";

describe("isOverKillLimit", () => {
  test("null sample fails open", () => {
    expect(isOverKillLimit(null, 90)).toBe(false);
  });
  test("under kill is false", () => {
    expect(isOverKillLimit(89, 90)).toBe(false);
  });
  test("at/over kill is true", () => {
    expect(isOverKillLimit(90, 90)).toBe(true);
    expect(isOverKillLimit(95, 90)).toBe(true);
  });
});

describe("effectiveMaxParallel", () => {
  test("returns configured when disabled or under", () => {
    expect(effectiveMaxParallel(2, { enabled: false, overKill: true })).toBe(2);
    expect(effectiveMaxParallel(2, { enabled: true, overKill: false })).toBe(2);
  });
  test("forces 1 when enabled and over", () => {
    expect(effectiveMaxParallel(4, { enabled: true, overKill: true })).toBe(1);
  });
});

describe("nextSustainedPressure", () => {
  test("single spike then under does not trip", () => {
    let s = { prevOver: false };
    let r = nextSustainedPressure(s, 95, 90);
    expect(r.trip).toBe(false);
    expect(r.over).toBe(true);
    r = nextSustainedPressure(r.state, 80, 90);
    expect(r.trip).toBe(false);
    expect(r.over).toBe(false);
  });

  test("two consecutive overs trip", () => {
    let s = { prevOver: false };
    let r = nextSustainedPressure(s, 95, 90);
    expect(r.trip).toBe(false);
    r = nextSustainedPressure(r.state, 92, 90);
    expect(r.trip).toBe(true);
    expect(r.over).toBe(true);
  });

  test("null sample fails open and clears prevOver", () => {
    const r = nextSustainedPressure({ prevOver: true }, null, 90);
    expect(r.trip).toBe(false);
    expect(r.over).toBe(false);
    expect(r.state.prevOver).toBe(false);
  });
});

describe("createInFlightMonitor", () => {
  test("trips after two over samples and calls onTrip once", () => {
    const calls: number[] = [];
    const timers: Array<() => void> = [];
    const monitor = createInFlightMonitor({
      enabled: true,
      killPercent: 90,
      intervalMs: 2000,
      sample: () => 95,
      onTrip: () => calls.push(1),
      setIntervalFn: (fn: () => void) => {
        timers.push(fn);
        return 1 as unknown as ReturnType<typeof setInterval>;
      },
      clearIntervalFn: () => {},
    });
    monitor.start();
    expect(timers.length).toBe(1);
    timers[0](); // first over — arm
    expect(calls).toEqual([]);
    timers[0](); // second over — trip
    expect(calls).toEqual([1]);
    timers[0](); // already tripped — no second call
    expect(calls).toEqual([1]);
    monitor.stop();
  });

  test("disabled never samples", () => {
    let samples = 0;
    const timers: Array<() => void> = [];
    const monitor = createInFlightMonitor({
      enabled: false,
      killPercent: 90,
      sample: () => {
        samples += 1;
        return 99;
      },
      onTrip: () => {},
      setIntervalFn: (fn: () => void) => {
        timers.push(fn);
        return 1 as unknown as ReturnType<typeof setInterval>;
      },
      clearIntervalFn: () => {},
    });
    monitor.start();
    expect(timers.length).toBe(0);
    expect(samples).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && bun test src/main/load-guard/guard.test.ts`  
Expected: FAIL (module not found)

- [ ] **Step 3: Minimal implementation**

Implement everything in `guard.ts` (single file):

```typescript
// src/main/load-guard/guard.ts
export function isOverKillLimit(usedPercent: number | null, killPercent: number): boolean {
  if (usedPercent == null || !Number.isFinite(usedPercent)) return false;
  return usedPercent >= killPercent;
}

export function effectiveMaxParallel(
  configured: number,
  opts: { enabled: boolean; overKill: boolean }
): number {
  if (!opts.enabled || !opts.overKill) return configured;
  return 1;
}

export type SustainedPressure = { prevOver: boolean };

export function nextSustainedPressure(
  state: SustainedPressure,
  sample: number | null,
  killPercent: number
): { state: SustainedPressure; trip: boolean; over: boolean } {
  if (sample == null) {
    return { state: { prevOver: false }, trip: false, over: false };
  }
  const over = isOverKillLimit(sample, killPercent);
  const trip = state.prevOver && over;
  return { state: { prevOver: over }, trip, over };
}

export type InFlightMonitorOpts = {
  enabled: boolean;
  killPercent: number;
  sample: () => number | null;
  onTrip: () => void;
  intervalMs?: number;
  setIntervalFn?: typeof setInterval;
  clearIntervalFn?: typeof clearInterval;
};

export function createInFlightMonitor(opts: InFlightMonitorOpts): {
  start(): void;
  stop(): void;
} {
  const intervalMs = opts.intervalMs ?? 2000;
  const setIntervalFn = opts.setIntervalFn ?? setInterval;
  const clearIntervalFn = opts.clearIntervalFn ?? clearInterval;
  let handle: ReturnType<typeof setInterval> | null = null;
  let pressure: SustainedPressure = { prevOver: false };
  let tripped = false;

  return {
    start() {
      if (!opts.enabled || handle) return;
      handle = setIntervalFn(() => {
        if (tripped) return;
        const next = nextSustainedPressure(pressure, opts.sample(), opts.killPercent);
        pressure = next.state;
        if (next.trip) {
          tripped = true;
          opts.onTrip();
        }
      }, intervalMs);
    },
    stop() {
      if (handle != null) {
        clearIntervalFn(handle);
        handle = null;
      }
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd app && bun test src/main/load-guard/guard.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit (only if user asked)**

```bash
git add app/src/main/load-guard/guard.ts app/src/main/load-guard/guard.test.ts
git commit -m "feat: add load-guard pressure helpers and sustained monitor"
```

---

### Task 4: Settings types, defaults, resolve, deep-merge

**Files:**
- Modify: `src/types/domain.d.ts` (`AgentSettings`)
- Modify: `src/main/agents/types.ts` (`AgentSettings`)
- Modify: `src/main/settings.ts` (DEFAULTS + `write` merge)
- Modify: `src/main/agents/settings.ts` (`resolveAgentSettings`)
- Modify: `src/main/agents/settings.test.ts`

**Interfaces:**
- Produces:
  - `interface LoadProtectionSettings { enabled: boolean; killPercent: number }`
  - `AgentSettings.loadProtection: LoadProtectionSettings`
  - `resolveAgentSettings` returns clamped `loadProtection` (`enabled` default true; `killPercent` via `clampKillPercent`)
  - `settings.write({ agents: { loadProtection: {...} } })` deep-merges and clamps

**Integration notes (real code today):**
- `settings.write` already deep-merges `agents.models` and clamps `maxParallel` via `clampMaxParallel` — mirror that for `loadProtection`.
- `resolveAgentSettings` currently returns only `{ enabled, maxParallel, models }` — extend it.
- Keep both ambient `domain.d.ts` and `agents/types.ts` in sync (existing dual definition).

- [ ] **Step 1: Extend types**

In `src/types/domain.d.ts` and `src/main/agents/types.ts`:

```typescript
interface LoadProtectionSettings {
  enabled: boolean;
  killPercent: number;
}

interface AgentSettings {
  enabled: boolean;
  maxParallel: number;
  models: AgentModelMap;
  loadProtection: LoadProtectionSettings;
}
```

(In `agents/types.ts` use `export interface` as today.)

- [ ] **Step 2: Defaults + merge in `settings.ts`**

```typescript
import { clampKillPercent } from "./load-guard/clamp";

// inside DEFAULTS.agents:
loadProtection: {
  enabled: true,
  killPercent: 90,
},

// inside write(), when patch.agents:
next.agents = {
  ...prev.agents,
  ...patch.agents,
  models: { ...prev.agents.models, ...(patch.agents.models || {}) },
  maxParallel: clampMaxParallel(patch.agents.maxParallel ?? prev.agents.maxParallel),
  loadProtection: {
    ...prev.agents.loadProtection,
    ...(patch.agents.loadProtection || {}),
    enabled:
      (patch.agents.loadProtection?.enabled ?? prev.agents.loadProtection?.enabled) !== false,
    killPercent: clampKillPercent(
      patch.agents.loadProtection?.killPercent ?? prev.agents.loadProtection?.killPercent
    ),
  },
};
```

Ensure `read()` still spreads `DEFAULTS` so older settings files get `loadProtection`.

- [ ] **Step 3: Resolve helper + failing tests**

```typescript
// src/main/agents/settings.ts — resolveAgentSettings return:
import { clampKillPercent } from "../load-guard/clamp";

return {
  enabled: agents?.enabled !== false,
  maxParallel: clampMaxParallel(agents?.maxParallel),
  models: { /* unchanged */ },
  loadProtection: {
    enabled: agents?.loadProtection?.enabled !== false,
    killPercent: clampKillPercent(agents?.loadProtection?.killPercent),
  },
};
```

```typescript
// append to src/main/agents/settings.test.ts
import { clampKillPercent } from "../load-guard/clamp";

const baseWithLp: AgentSettings = {
  ...base,
  loadProtection: { enabled: true, killPercent: 90 },
};

describe("resolveAgentSettings loadProtection", () => {
  test("defaults missing loadProtection to enabled + 90", () => {
    const r = resolveAgentSettings({
      agents: { enabled: true, maxParallel: 2, models: base.models },
    } as AppSettings);
    expect(r.loadProtection).toEqual({ enabled: true, killPercent: 90 });
  });

  test("clamps killPercent on resolve", () => {
    const r = resolveAgentSettings({
      agents: {
        ...baseWithLp,
        loadProtection: { enabled: true, killPercent: 10 },
      },
    } as AppSettings);
    expect(r.loadProtection.killPercent).toBe(50);
  });

  test("enabled false is preserved", () => {
    const r = resolveAgentSettings({
      agents: {
        ...baseWithLp,
        loadProtection: { enabled: false, killPercent: 90 },
      },
    } as AppSettings);
    expect(r.loadProtection.enabled).toBe(false);
  });
});

test("clampKillPercent agrees with resolve for out-of-range patch", () => {
  expect(clampKillPercent(120)).toBe(99);
});
```

Update existing `base` in the test file to include `loadProtection` so `AgentSettings` typechecks.

- [ ] **Step 4: Run tests**

Run: `cd app && bun test src/main/agents/settings.test.ts src/main/load-guard/clamp.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit (only if user asked)**

```bash
git add app/src/types/domain.d.ts app/src/main/agents/types.ts app/src/main/settings.ts \
  app/src/main/agents/settings.ts app/src/main/agents/settings.test.ts
git commit -m "feat: add agents.loadProtection settings defaults and resolve"
```

---

### Task 5: Orchestrator wave-boundary hook

**Files:**
- Modify: `src/main/agents/orchestrator.ts`
- Modify: `src/main/agents/orchestrator.test.ts`

**Interfaces:**
- Consumes: caller-provided pressure decision (ipc wires load-guard in Task 6)
- Produces / extends:
  - `OrchestratorDeps.beforeWave?: () => { maxParallel: number; softStop: boolean }`
  - Before each wave (after `isCancelled` check): if `beforeWave` present, use its `maxParallel`; if `softStop` (or `isCancelled()` after), return `{ text: "", fellBack: false }` without starting the wave
  - When `beforeWave` omitted, behavior unchanged (`deps.maxParallel`)

**Integration notes (real code today):**
- Wave loop in `runOrchestratedTurn` (~L44–50): checks `isCancelled()`, then `nextWave(..., deps.maxParallel)`.
- Soft-stop already works via `isCancelled: () => cancelledChats.has(id)` from ipc — `beforeWave` should have the caller add to `cancelledChats` when over, then orchestrator short-circuits.

- [ ] **Step 1: Write the failing tests**

```typescript
// append to src/main/agents/orchestrator.test.ts
test("beforeWave forces maxParallel 1 for the wave", async () => {
  const started: string[] = [];
  await runOrchestratedTurn("do", {
    maxParallel: 2,
    beforeWave: () => ({ maxParallel: 1, softStop: false }),
    planTurn: async () => ({
      steps: [
        { id: "a", goal: "A", dependsOn: [], kind: "memory" },
        { id: "b", goal: "B", dependsOn: [], kind: "memory" },
        { id: "c", goal: "C", dependsOn: ["a", "b"], kind: "synthesize" },
      ],
    }),
    assignKinds: (p) => p,
    runStep: async (step) => {
      started.push(step.id);
      return { id: step.id, ok: true, output: step.id };
    },
    synthesize: async () => "ok",
    act: () => {},
    isCancelled: () => false,
  });
  // With maxParallel 1, first wave is only one of the independent steps.
  expect(started[0] === "a" || started[0] === "b").toBe(true);
  expect(started.length).toBe(2);
});

test("beforeWave softStop skips remaining waves", async () => {
  let waves = 0;
  const r = await runOrchestratedTurn("do", {
    maxParallel: 2,
    beforeWave: () => {
      waves += 1;
      return { maxParallel: 1, softStop: waves >= 1 };
    },
    planTurn: async () => ({
      steps: [
        { id: "a", goal: "A", dependsOn: [], kind: "memory" },
        { id: "b", goal: "B", dependsOn: ["a"], kind: "memory" },
        { id: "c", goal: "final", dependsOn: ["b"], kind: "synthesize" },
      ],
    }),
    assignKinds: (p) => p,
    runStep: async (step) => ({ id: step.id, ok: true, output: "x" }),
    synthesize: async () => "should not run",
    act: () => {},
    isCancelled: () => false,
  });
  expect(r.fellBack).toBe(false);
  expect(r.text).toBe("");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && bun test src/main/agents/orchestrator.test.ts`  
Expected: FAIL (beforeWave not honored / unknown property)

- [ ] **Step 3: Minimal implementation**

```typescript
// src/main/agents/orchestrator.ts — extend OrchestratorDeps:
export interface OrchestratorDeps {
  maxParallel: number;
  /** Optional load-protection hook: re-sample before each wave. */
  beforeWave?: () => { maxParallel: number; softStop: boolean };
  planTurn: (userText: string) => Promise<AgentPlan | null>;
  assignKinds: (plan: AgentPlan) => AgentPlan;
  runStep: (step: AgentStep) => Promise<StepResult>;
  synthesize: (ctx: { userText: string }, results: StepResult[]) => Promise<string>;
  act: (event: ActivityEvent) => void;
  isCancelled: () => boolean;
}

// inside the while loop, after isCancelled check:
while (done.size < runnableSteps.length) {
  if (deps.isCancelled()) {
    return { text: "", fellBack: false };
  }

  let maxParallel = deps.maxParallel;
  if (deps.beforeWave) {
    const decision = deps.beforeWave();
    maxParallel = decision.maxParallel;
    if (decision.softStop || deps.isCancelled()) {
      return { text: "", fellBack: false };
    }
  }

  const wave = nextWave(runnableSteps, done, maxParallel);
  if (wave.length === 0) break;
  // ... unchanged
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd app && bun test src/main/agents/orchestrator.test.ts`  
Expected: PASS (including existing cancel/fallback tests)

- [ ] **Step 5: Commit (only if user asked)**

```bash
git add app/src/main/agents/orchestrator.ts app/src/main/agents/orchestrator.test.ts
git commit -m "feat: sample load protection before each orchestrator wave"
```

---

### Task 6: IPC turn-start sample, in-flight monitor, stop reason

**Files:**
- Modify: `src/main/ipc.ts`
- Modify: `preload.ts`
- Modify: `src/types/api.d.ts`

**Interfaces:**
- Consumes: `systemRamUsedPercent`, `isOverKillLimit`, `effectiveMaxParallel`, `createInFlightMonitor`, `resolveAgentSettings().loadProtection`
- Produces:
  - Soft-stop via `cancelledChats.add(id)` + `rejectPendingForChat(id)` (same as `chat:cancel`)
  - `chat:done` payload may include `stopReason?: "memory"` and `killPercent?: number`
  - Chat API resolve: `{ full, usage, stopped?, stopReason?, killPercent? }`

**Integration notes (real code today):**
- Soft-stop entry: `ipcMain.on("chat:cancel")` → `cancelledChats.add(id)` + `rejectPendingForChat(id)` (~L235–239).
- Multi-agent: `runOrchestratedTurn(..., { maxParallel: agentCfg.maxParallel, isCancelled: () => cancelledChats.has(id), ... })` (~L826–878).
- Single-agent loop checks `cancelledChats` at top of each round (~L898–902).
- `finishTurn(..., stopped)` sends `chat:done` with `stopped` (~L712–724).
- Preload resolves `{ full, usage, stopped }` only (~L230).

- [ ] **Step 1: Extend API types + preload**

```typescript
// api.d.ts chat() return:
Promise<{
  full: string;
  usage: ChatUsage;
  stopped?: boolean;
  stopReason?: "memory";
  killPercent?: number;
}>;

// preload.ts done handler:
resolve({
  full: m.full,
  usage: m.usage,
  stopped: !!m.stopped,
  stopReason: m.stopReason === "memory" ? "memory" : undefined,
  killPercent: typeof m.killPercent === "number" ? m.killPercent : undefined,
});
```

- [ ] **Step 2: Wire load-guard in `chat:start` (implementation sketch — keep thin)**

Near the top of the turn handler (after `id` is known and `finishTurn` is defined, before the multi-agent gate / single-agent loop — i.e. just after `const agentCfg = resolveAgentSettings(...)` is fine, but turn-start soft-stop must run **before** classify/plan/model work):

```typescript
import { systemRamUsedPercent } from "./load-guard/system-memory";
import {
  createInFlightMonitor,
  effectiveMaxParallel,
  isOverKillLimit,
} from "./load-guard/guard";

const agentCfg = resolveAgentSettings(settings.read());
const lp = agentCfg.loadProtection;
let stopReason: "memory" | undefined;
let stopKillPercent: number | undefined;
let sampleFailedLogged = false;

const sampleOrNull = (): number | null => {
  if (!lp.enabled) return null;
  const pct = systemRamUsedPercent();
  if (pct == null && !sampleFailedLogged) {
    sampleFailedLogged = true;
    console.warn("[load-guard] system RAM sample failed; failing open");
  }
  return pct;
};

const tripSoftStop = (pct: number) => {
  cancelledChats.add(id);
  rejectPendingForChat(id);
  stopReason = "memory";
  stopKillPercent = lp.killPercent;
  void pct;
};

// Before any classify / orchestrator / chatStream work:
if (lp.enabled) {
  const pct = sampleOrNull();
  if (isOverKillLimit(pct, lp.killPercent)) {
    tripSoftStop(pct as number);
    await finishTurn("", multiPromptTokens, multiCompletionTokens, true);
    // ensure chat:done includes stopReason — see finishTurn tweak below
    return;
  }
}

const monitor = createInFlightMonitor({
  enabled: lp.enabled,
  killPercent: lp.killPercent,
  sample: sampleOrNull,
  onTrip: () => {
    const pct = sampleOrNull();
    tripSoftStop(pct ?? lp.killPercent);
  },
});
monitor.start();
try {
  // ... existing multi + single paths ...
} finally {
  monitor.stop();
}
```

Extend `finishTurn` to accept/pass reason:

```typescript
const finishTurn = async (
  text: string,
  totalPrompt: number,
  totalCompletion: number,
  stopped: boolean
) => {
  // ... existing metering / activity ...
  send("chat:done", {
    id,
    full: text,
    stopped,
    ...(stopped && stopReason === "memory"
      ? { stopReason: "memory", killPercent: stopKillPercent ?? lp.killPercent }
      : {}),
    usage: { /* unchanged */ },
  });
  // ... persist unchanged ...
};
```

Wire orchestrator:

```typescript
const orchResult = await runOrchestratedTurn(lastText, {
  maxParallel: agentCfg.maxParallel,
  beforeWave: () => {
    if (!lp.enabled) {
      return { maxParallel: agentCfg.maxParallel, softStop: false };
    }
    const pct = sampleOrNull();
    const over = isOverKillLimit(pct, lp.killPercent);
    if (over) tripSoftStop(pct as number);
    return {
      maxParallel: effectiveMaxParallel(agentCfg.maxParallel, {
        enabled: true,
        overKill: over,
      }),
      softStop: over,
    };
  },
  // ... existing planTurn, assignKinds, runStep, synthesize, act ...
  isCancelled: () => cancelledChats.has(id),
});
```

**Ordering constraint:** Move `const agentCfg = resolveAgentSettings(...)` and the turn-start sample to **before** the complexity classify / `trackedGenerate` path so an over-limit machine does not pay for classify. Today `agentCfg` is already resolved just before the gate (~L763); insert the sample immediately after that resolve and `return` via `finishTurn` before lean/classify when over.

If turn-start soft-stop runs before `finishTurn` is defined, hoist a small local helper or place the check after `finishTurn` but still before classify — prefer after `finishTurn` definition (~L740) and before leanComplexity (~L766).

- [ ] **Step 3: Manual / light verification**

There is no dedicated ipc unit harness for `chat:start`. Verify by running existing suites that must stay green:

Run: `cd app && bun test src/main/load-guard src/main/agents/orchestrator.test.ts src/main/agents/settings.test.ts`  
Expected: PASS

Optionally smoke in Electron: set kill % to 50, enable protection, send a chat under load — bubble should stop with memory reason (full UI in Task 8).

- [ ] **Step 4: Commit (only if user asked)**

```bash
git add app/src/main/ipc.ts app/preload.ts app/src/types/api.d.ts
git commit -m "feat: soft-stop turns on system memory pressure"
```

---

### Task 7: Settings → Agents Load protection UI

**Files:**
- Modify: `src/renderer/index.html` (Agents section after max-parallel)
- Modify: `src/renderer/js/settings.ts`
- Modify: `src/renderer/styles.css` (narrow number input, reuse `.agents-max-parallel` or twin class)

**Interfaces:**
- Consumes: `settings:get` / `settings:set` via existing `save({ agents: { loadProtection } })`
- Produces: toggle `#load-protection-enabled`, number `#load-protection-kill` min=50 max=99

**Integration notes (real code today):**
- Agents block in `index.html` ~L379–416 (`#agents-enabled`, `#agents-max-parallel`, model selects).
- `paintAgentsSettings` / `bind` in `settings.ts` already patch nested `agents`.

- [ ] **Step 1: Add HTML after Max parallel steps row**

```html
<div class="setting-row">
  <div class="label">
    Load protection
    <small>Soft-stop the current turn when system memory used stays over this %.</small>
  </div>
  <label class="switch">
    <input type="checkbox" id="load-protection-enabled" />
    <span class="track"></span>
  </label>
</div>

<div class="setting-row">
  <div class="label">
    Memory kill threshold
    <small>Stop the turn at this system RAM used % (50–99).</small>
  </div>
  <input
    type="number"
    id="load-protection-kill"
    class="auth-input agents-max-parallel"
    min="50"
    max="99"
  />
</div>
```

- [ ] **Step 2: Paint + bind in `settings.ts`**

```typescript
function paintAgentsSettings() {
  const agents = settings.agents;
  el("agents-enabled").checked = agents?.enabled !== false;
  el("agents-max-parallel").value = String(agents?.maxParallel ?? 2);
  el("load-protection-enabled").checked = agents?.loadProtection?.enabled !== false;
  el("load-protection-kill").value = String(agents?.loadProtection?.killPercent ?? 90);
  for (const { id, key } of AGENT_MODEL_SELECTS) {
    el(id).value = agents?.models?.[key] ?? "";
  }
}

// in bind():
el("load-protection-enabled").onchange = (e) =>
  save({ agents: { loadProtection: { enabled: (e.target as UiElement).checked } } });
el("load-protection-kill").onchange = (e) =>
  save({ agents: { loadProtection: { killPercent: Number((e.target as UiElement).value) } } });
```

- [ ] **Step 3: Manual check**

Open Settings → Agents: toggle off/on, set kill to 85, reload settings — values persist via `settings:set` clamp on main.

- [ ] **Step 4: Commit (only if user asked)**

```bash
git add app/src/renderer/index.html app/src/renderer/js/settings.ts app/src/renderer/styles.css
git commit -m "feat: add Load protection controls under Settings → Agents"
```

---

### Task 8: Renderer stop reason messaging

**Files:**
- Modify: `src/renderer/js/turns.ts`
- Modify: `src/types/api.d.ts` (already done in Task 6 — confirm)

**Interfaces:**
- Consumes: `result.stopped`, `result.stopReason`, `result.killPercent` from `api.chat`
- Produces: bubble child text `Stopped: system memory over N%` when `stopReason === "memory"`; else existing `Stopped`

**Integration notes (real code today):**
- `turns.ts` ~L498–499: `if (result.stopped) turn.bubble.appendChild(node("div", "msg-stopped", "Stopped"));`

- [ ] **Step 1: Update label**

```typescript
if (result.stopped) {
  turn.bubble.appendChild(
    node(
      "div",
      "msg-stopped",
      result.stopReason === "memory"
        ? `Stopped: system memory over ${result.killPercent ?? "?"}%`
        : "Stopped"
    )
  );
}
```

- [ ] **Step 2: Sanity**

User-stop still shows `Stopped`. Memory soft-stop shows `Stopped: system memory over 90%` (or configured %).

- [ ] **Step 3: Commit (only if user asked)**

```bash
git add app/src/renderer/js/turns.ts
git commit -m "feat: show memory pressure stop reason on chat bubble"
```

---

### Task 9: End-to-end verification + self-check

**Files:**
- None new (run suites + spot-check against spec)

- [ ] **Step 1: Run focused tests**

Run:

```bash
cd app && bun test \
  src/main/load-guard \
  src/main/agents/settings.test.ts \
  src/main/agents/orchestrator.test.ts \
  src/main/agents/max-parallel.test.ts
```

Expected: PASS

- [ ] **Step 2: Spec checklist (manual)**

Confirm each locked decision is implemented:

| Spec item | Where |
|-----------|--------|
| Soft-stop only (no Ollama kill) | Task 6 `cancelledChats` |
| System RAM used % | Task 2 |
| Kill line → maxParallel 1 + soft-stop | Tasks 3, 5, 6 |
| No warn/throttle band | No code path below kill |
| Default 90, clamp 50–99 | Tasks 1, 4, 7 |
| `enabled` default on | Task 4 |
| Sample: turn start / wave / ~2s in-flight | Tasks 5, 6 |
| Settings → Agents UI | Task 7 |
| Fail open on sample error | Tasks 2, 3, 6 |
| Stop reason copy | Task 8 |
| No idle watchdog | No interval outside turn |

- [ ] **Step 3: Commit (only if user asked)**

```bash
git add -A
git commit -m "test: verify load-protection suites against design checklist"
```

(Skip empty commit if nothing left to stage.)

---

## Self-review (plan vs spec)

**1. Spec coverage**

| Spec section | Tasks |
|--------------|-------|
| Soft-stop current turn only | 6 |
| System RAM used % | 2 |
| At kill: maxParallel=1 + soft-stop | 3, 5, 6 |
| No throttle band | Global constraint + no tasks for warn % |
| Default 90 / clamp 50–99 | 1, 4, 7 |
| Feature flag default on | 4, 7 |
| Sample turn / wave / ~2s | 3, 5, 6 |
| Settings → Agents UI | 7 |
| Fail open | 2, 3, 6 |
| Stop reason messaging | 6, 8 |
| Reuse stop path + resolveAgentSettings | 4, 5, 6 |
| Non-goals (no Ollama kill, no idle watchdog, no disk, no maxParallel default change) | Global constraints; no tasks |

**2. Placeholder scan** — none intentional; Task 6 uses a concrete wiring sketch against real `ipc.ts` line regions; Task 8 calls out the exact bubble copy.

**3. Type consistency**

- `LoadProtectionSettings.{enabled,killPercent}` used in domain, agents/types, settings defaults, resolve, UI, guard.
- `beforeWave(): { maxParallel; softStop }` shared by orchestrator tests and ipc wiring.
- `stopReason: "memory"` + `killPercent` shared by ipc → preload → api.d.ts → turns.ts.
- Sustained trip = two consecutive over samples (~2s interval), matching spec testing notes.
