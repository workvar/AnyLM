import { describe, expect, test } from "bun:test";
import { generateDocumentToolMessage } from "./messages";

test("project wording", () => {
  expect(generateDocumentToolMessage("a.pdf", true)).toContain("project folder");
});
test("standalone wording", () => {
  expect(generateDocumentToolMessage("a.pdf", false)).toContain("Documents/AnyLM/generated");
});
