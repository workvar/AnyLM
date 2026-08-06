// src/renderer/js/messages.test.ts
import { describe, expect, test } from "bun:test";
import { isLlmMessage, fileArtifact, askArtifact, llmMessages } from "./messages";

describe("messages helpers", () => {
  test("fileArtifact shape", () => {
    const m = fileArtifact({ name: "a.pdf", ext: ".pdf", dir: "/tmp" });
    expect(m.role).toBe("artifact");
    expect(m.type).toBe("file");
    expect(m.name).toBe("a.pdf");
    expect(typeof m.createdAt).toBe("number");
  });

  test("askArtifact skipped", () => {
    const m = askArtifact({ question: "Topic?", answer: null });
    expect(m.role).toBe("ask");
    expect(m.answer).toBeNull();
  });

  test("llmMessages filters artifact and ask", () => {
    const out = llmMessages([
      { role: "user", content: "hi" },
      fileArtifact({ name: "a.pdf", ext: ".pdf", dir: "/d" }),
      askArtifact({ question: "Q?", answer: "A" }),
      { role: "assistant", content: "ok" },
    ]);
    expect(out.map((m) => m.role)).toEqual(["user", "assistant"]);
  });

  test("llmMessages strips activity from assistant messages", () => {
    const stored: ChatMessage = {
      role: "assistant",
      content: "ok",
      activity: {
        thoughtMs: 1200,
        toolCount: 1,
        summary: "Thought briefly · 1 tool",
        events: [{ kind: "thinking", phase: "end", ms: 1200 }],
      },
    };
    const out = llmMessages([
      { role: "user", content: "hi" },
      stored,
    ]);
    expect(out).toEqual([
      { role: "user", content: "hi" },
      { role: "assistant", content: "ok" },
    ]);
    expect(stored.activity).toBeDefined();
  });

  test("isLlmMessage", () => {
    expect(isLlmMessage({ role: "user", content: "x" })).toBe(true);
    expect(isLlmMessage(fileArtifact({ name: "a.pdf", ext: ".pdf", dir: "/d" }))).toBe(false);
  });
});
