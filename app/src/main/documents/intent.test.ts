import { describe, expect, test } from "bun:test";
import { detect, promptBlock } from "./intent";

describe("document intent", () => {
  test("detects PDF create requests", () => {
    expect(detect("Please create a PDF about RSA")).toBe("pdf");
  });

  test("prompt tells the model not to claim success when the tool was declined", () => {
    const block = promptBlock("pdf");
    expect(block).toContain("generate_document");
    expect(block.toLowerCase()).toMatch(/declin|denied|fail|error/);
    expect(block).not.toMatch(/After the tool returns, tell the user the file is ready/);
  });
});
