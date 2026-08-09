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
