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
