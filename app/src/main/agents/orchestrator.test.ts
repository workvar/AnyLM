import { describe, expect, test } from "bun:test";
import { runOrchestratedTurn } from "./orchestrator";
import type { StepResult } from "./types";

test("falls back when planner fails", async () => {
  const r = await runOrchestratedTurn("hi", {
    maxParallel: 2,
    planTurn: async () => null,
    assignKinds: (p) => p,
    runStep: async (_step, _prior) => ({ id: "x", ok: true, output: "" }),
    synthesize: async () => "nope",
    act: () => {},
    isCancelled: () => false,
  });
  expect(r.fellBack).toBe(true);
});

test("falls back when planner throws instead of hard-erroring", async () => {
  const r = await runOrchestratedTurn("hi", {
    maxParallel: 2,
    planTurn: async () => {
      throw new Error("ollama down");
    },
    assignKinds: (p) => p,
    runStep: async (_step, _prior) => ({ id: "x", ok: true, output: "" }),
    synthesize: async () => "nope",
    act: () => {},
    isCancelled: () => false,
  });
  expect(r.fellBack).toBe(true);
  expect(r.text).toBe("");
});

test("skips synthesize when cancelled right after the last wave", async () => {
  let synthesizeCalled = false;
  let cancelNow = false;
  const r = await runOrchestratedTurn("hi", {
    maxParallel: 2,
    planTurn: async () => ({
      steps: [{ id: "a", goal: "do it", dependsOn: [], kind: "tool" }],
    }),
    assignKinds: (p) => p,
    runStep: async (step) => {
      // Flip cancellation only after the wave's step has completed, so the
      // top-of-loop check doesn't short-circuit before we exercise the
      // pre-synthesize check specifically.
      cancelNow = true;
      return { id: step.id, ok: true, output: "done" };
    },
    synthesize: async () => {
      synthesizeCalled = true;
      return "should not happen";
    },
    act: () => {},
    isCancelled: () => cancelNow,
  });
  expect(synthesizeCalled).toBe(false);
  expect(r.fellBack).toBe(false);
  expect(r.text).toBe("");
});

test("passes completed dependency outputs to runStep", async () => {
  const seen: { stepId: string; prior: StepResult[] }[] = [];
  await runOrchestratedTurn("do stuff", {
    maxParallel: 2,
    planTurn: async () => ({
      steps: [
        { id: "research", goal: "Research X", dependsOn: [], kind: "research" },
        { id: "fc", goal: "Fact check claims", dependsOn: ["research"], kind: "fact_check" },
        { id: "final", goal: "Write reply", dependsOn: ["fc"], kind: "synthesize" },
      ],
    }),
    assignKinds: (p) => p,
    runStep: async (step, prior) => {
      seen.push({ stepId: step.id, prior: [...prior] });
      return { id: step.id, ok: true, output: `${step.id}-out` };
    },
    synthesize: async () => "done",
    act: () => {},
    isCancelled: () => false,
  });
  expect(seen.find((s) => s.stepId === "research")?.prior).toEqual([]);
  expect(seen.find((s) => s.stepId === "fc")?.prior).toEqual([
    { id: "research", ok: true, output: "research-out" },
  ]);
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

test("inserts fact_check after assignKinds before agent:plan", async () => {
  let planSteps: { id: string; goal: string; stepKind?: string }[] = [];
  await runOrchestratedTurn("Research X thoroughly", {
    maxParallel: 2,
    planTurn: async () => ({
      steps: [{ id: "1", goal: "Research X", dependsOn: [], kind: "research" }],
    }),
    assignKinds: (p) => ({
      steps: [
        ...p.steps,
        { id: "2", goal: "Write reply", dependsOn: ["1"], kind: "synthesize" },
      ],
    }),
    runStep: async (step) => ({ id: step.id, ok: true, output: "done" }),
    synthesize: async () => "final",
    act: (e) => {
      if (e.kind === "agent:plan") planSteps = e.steps;
    },
    isCancelled: () => false,
  });
  expect(planSteps.some((s) => s.stepKind === "fact_check")).toBe(true);
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
