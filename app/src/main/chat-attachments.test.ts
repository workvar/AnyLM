// src/main/chat-attachments.test.ts
import { describe, expect, test } from "bun:test";
import { conversationAttachments, dataUrlToBase64 } from "./chat-attachments";

describe("dataUrlToBase64", () => {
  test("strips prefix", () => {
    expect(dataUrlToBase64("data:image/png;base64,abc123")).toBe("abc123");
  });
  test("null on empty", () => {
    expect(dataUrlToBase64("")).toBeNull();
    expect(dataUrlToBase64("not-a-data-url")).toBeNull();
  });
});

describe("conversationAttachments", () => {
  test("collects all docs and images in order", () => {
    const out = conversationAttachments([
      { role: "attachment", kind: "doc", name: "a.txt", text: "A" },
      { role: "user", content: "first" },
      { role: "assistant", content: "ok" },
      { role: "attachment", kind: "image", name: "b.png", dataUrl: "data:image/png;base64,BBB" },
      { role: "attachment", kind: "doc", name: "c.txt", text: "C" },
      { role: "user", content: "second" },
    ]);
    expect(out.docs).toEqual([
      { name: "a.txt", text: "A" },
      { name: "c.txt", text: "C" },
    ]);
    expect(out.images).toEqual(["BBB"]);
  });

  test("skips incomplete attachments", () => {
    const out = conversationAttachments([
      { role: "attachment", kind: "doc", name: "empty.txt" },
      { role: "attachment", kind: "image", name: "no.png" },
      { role: "user", content: "hi" },
    ]);
    expect(out.docs).toEqual([]);
    expect(out.images).toEqual([]);
  });

  test("ignores non-attachment roles", () => {
    const out = conversationAttachments([
      { role: "user", content: "hi", images: ["should-not-use"] },
      { role: "artifact", type: "file", name: "x.pdf" },
    ]);
    expect(out.docs).toEqual([]);
    expect(out.images).toEqual([]);
  });
});
