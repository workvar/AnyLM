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
