import { describe, expect, test } from "bun:test";
import { projectFirstPromptBlock } from "./prompt";

describe("projectFirstPromptBlock", () => {
  test("requires tools and forbids full source paste", () => {
    const s = projectFirstPromptBlock();
    expect(s.toLowerCase()).toMatch(/run_shell/);
    expect(s.toLowerCase()).toMatch(/write_file/);
    expect(s.toLowerCase()).toMatch(/never|do not/);
    expect(s.toLowerCase()).toMatch(/summary|file list|paths/);
  });
});
