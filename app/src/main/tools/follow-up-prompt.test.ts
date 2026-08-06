import { describe, expect, test } from "bun:test";
import { followUpPromptBlock } from "./follow-up-prompt";

describe("followUpPromptBlock", () => {
  test("mentions confirmations and shell caution", () => {
    const s = followUpPromptBlock().toLowerCase();
    expect(s).toMatch(/do it|go ahead/);
    expect(s).toMatch(/this|that|complete/);
    expect(s).toMatch(/shell/);
  });
});
