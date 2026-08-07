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
