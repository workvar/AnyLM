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

test("falls back when planner throws instead of hard-erroring", async () => {
  const r = await runOrchestratedTurn("hi", {
    maxParallel: 2,
    planTurn: async () => {
      throw new Error("ollama down");
    },
    assignKinds: (p) => p,
    runStep: async () => ({ id: "x", ok: true, output: "" }),
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
