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

test("assignKinds maps retrieve-ish goals", () => {
  const p = assignKinds({
    steps: [{ id: "a", goal: "Search project documents for budget", dependsOn: [], kind: "tool" }],
  });
  expect(p.steps[0].kind).toBe("retrieve");
});

test("assignKinds does not route a bare 'document' mention to retrieve", () => {
  const p = assignKinds({
    steps: [{ id: "a", goal: "Email the signed document to Bob", dependsOn: [], kind: "tool" }],
  });
  expect(p.steps[0].kind).not.toBe("retrieve");
  expect(p.steps[0].kind).toBe("tool");
});

test("assignKinds routes document generation goals to document not retrieve", () => {
  const p = assignKinds({
    steps: [{ id: "a", goal: "Generate a PDF document from the findings", dependsOn: [], kind: "tool" }],
  });
  expect(p.steps[0].kind).not.toBe("retrieve");
  expect(p.steps[0].kind).toBe("document");
});
