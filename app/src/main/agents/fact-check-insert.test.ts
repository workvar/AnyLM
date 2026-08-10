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
