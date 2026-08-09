import { describe, expect, test } from "bun:test";
import { isPreferentialKnowledge, leanComplexity } from "./complexity";

describe("isPreferentialKnowledge", () => {
  test("research", () => {
    expect(isPreferentialKnowledge("Research the latest Next.js app router docs")).toBe(true);
  });
  test("fact check", () => {
    expect(isPreferentialKnowledge("Fact check these claims about Ollama")).toBe(true);
  });
  test("summarize", () => {
    expect(isPreferentialKnowledge("Summarize the key points from this article")).toBe(true);
  });
  test("document", () => {
    expect(isPreferentialKnowledge("Write a PDF brief on local LLM tooling")).toBe(true);
  });
  test("plain Q&A false", () => {
    expect(isPreferentialKnowledge("What is 2+2?")).toBe(false);
  });
});

describe("leanComplexity preferential", () => {
  test("research phrase is complex even without tools", () => {
    expect(
      leanComplexity({
        text: "Research current Vite create-app options",
        useTools: false,
        hasProject: false,
        hasAttachments: false,
      })
    ).toBe("complex");
  });
});

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
