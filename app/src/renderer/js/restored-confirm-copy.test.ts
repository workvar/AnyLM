import { expect, test } from "bun:test";
import { restoredDetail, restoredTitle, restoredWhen } from "./restored-confirm-copy";

const NOW = 1_700_000_000_000;

function rec(over: Partial<PendingConfirmRecord> = {}): PendingConfirmRecord {
  return {
    token: "t",
    key: "chat:c",
    toolName: "generate_document",
    args: { title: "How to build AI agents", format: "docx" },
    createdAt: NOW,
    status: "expired",
    ...over,
  };
}

test("document confirms name the file that would be created", () => {
  expect(restoredTitle(rec())).toBe("Create a file in your folder?");
  expect(restoredDetail(rec())).toBe("How to build AI agents.docx");
});

test("format defaults to pdf and tolerates a leading dot", () => {
  expect(restoredDetail(rec({ args: { title: "Notes" } }))).toBe("Notes.pdf");
  expect(restoredDetail(rec({ args: { title: "Notes", format: ".PDF" } }))).toBe("Notes.pdf");
});

test("unknown tools fall back to the tool name", () => {
  const r = rec({ toolName: "my_tool", args: {} });
  expect(restoredTitle(r)).toBe("Run my_tool?");
  expect(restoredDetail(r)).toBe("my_tool");
});

test("age reads in the largest sensible unit", () => {
  expect(restoredWhen(NOW, NOW)).toBe("Asked just now");
  expect(restoredWhen(NOW - 5 * 60_000, NOW)).toBe("Asked 5 min ago");
  expect(restoredWhen(NOW - 2 * 3_600_000, NOW)).toBe("Asked 2 hours ago");
  expect(restoredWhen(NOW - 26 * 3_600_000, NOW)).toBe("Asked 1 day ago");
});
