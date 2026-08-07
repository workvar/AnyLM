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

  test("ambiguous borderline: a real content signal without enough to be complex", () => {
    expect(
      leanComplexity({
        text: "Can you take a look at this file for me?",
        useTools: false,
        hasProject: false,
        hasAttachments: false,
      })
    ).toBe("ambiguous");
  });

  test("project + tools alone do not prevent simple on trivial Q&A", () => {
    expect(
      leanComplexity({
        text: "What is 2+2?",
        useTools: true,
        hasProject: true,
        hasAttachments: false,
      })
    ).toBe("simple");
  });

  test("tools alone (no content signal) stays simple", () => {
    expect(
      leanComplexity({
        text: "Help me organize my notes a bit",
        useTools: true,
        hasProject: false,
        hasAttachments: false,
      })
    ).toBe("simple");
  });

  test("project + tools still escalate to complex once a real signal is present", () => {
    expect(
      leanComplexity({
        text: "First search the web, then compare with project docs",
        useTools: true,
        hasProject: true,
        hasAttachments: false,
      })
    ).toBe("complex");
  });
});
