// src/renderer/js/web-research-hint.test.ts
import { describe, expect, test } from "bun:test";
import { shouldShowWebResearchHint } from "./web-research-hint";

describe("shouldShowWebResearchHint", () => {
  const base = {
    text: "Read https://example.com",
    globalEnabled: false,
    skillOverrides: [] as string[],
    dismissed: false,
  };
  test("shows when URL and skill inactive", () => {
    expect(shouldShowWebResearchHint(base)).toBe(true);
  });
  test("hidden when global enabled", () => {
    expect(shouldShowWebResearchHint({ ...base, globalEnabled: true })).toBe(false);
  });
  test("hidden when override present", () => {
    expect(
      shouldShowWebResearchHint({ ...base, skillOverrides: ["web-research"] })
    ).toBe(false);
  });
  test("hidden when dismissed", () => {
    expect(shouldShowWebResearchHint({ ...base, dismissed: true })).toBe(false);
  });
  test("hidden without URL", () => {
    expect(shouldShowWebResearchHint({ ...base, text: "no link here" })).toBe(false);
  });
});
