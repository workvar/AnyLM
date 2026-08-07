import { describe, expect, test } from "bun:test";
import { leanComplexity } from "./complexity";

describe("leanComplexity", () => {
  test("simple short Q&A without tools", () => {
    expect(
      leanComplexity({
        text: "What is 2+2?",
        useTools: false,
        hasProject: false,
        hasAttachments: false,
      })
    ).toBe("simple");
  });

  test("complex when URL present", () => {
    expect(
      leanComplexity({
        text: "Summarize https://example.com/docs",
        useTools: true,
        hasProject: false,
        hasAttachments: false,
      })
    ).toBe("complex");
  });

  test("complex for multi-step language + tools", () => {
    expect(
      leanComplexity({
        text: "First search the web, then compare with project docs and write a summary",
        useTools: true,
        hasProject: true,
        hasAttachments: false,
      })
    ).toBe("complex");
  });

  test("ambiguous borderline", () => {
    expect(
      leanComplexity({
        text: "Help me organize my notes a bit",
        useTools: true,
        hasProject: false,
        hasAttachments: false,
      })
    ).toBe("ambiguous");
  });
});
