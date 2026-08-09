import { expect, test } from "bun:test";
import { labelForStepKind } from "./labels";

test("labels", () => {
  expect(labelForStepKind("research")).toBe("Research");
  expect(labelForStepKind("fact_check")).toBe("Fact check");
  expect(labelForStepKind("summarize")).toBe("Summarize");
  expect(labelForStepKind("document")).toBe("Document");
  expect(labelForStepKind("memory")).toBe("memory");
});
