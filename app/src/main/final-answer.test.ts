import { describe, expect, test } from "bun:test";
import { finalAnswerPrompt, needsFinalAnswer } from "./final-answer";

const base = { text: "here you go", stopped: false, toolsRun: 3, hitRoundCap: false };

describe("needsFinalAnswer", () => {
  test("normal turn with a reply needs nothing", () => {
    expect(needsFinalAnswer(base)).toBe(false);
  });

  test("empty reply after tools ran gets a forced pass", () => {
    expect(needsFinalAnswer({ ...base, text: "   " })).toBe(true);
  });

  test("round cap gets a forced pass even with partial text", () => {
    expect(needsFinalAnswer({ ...base, hitRoundCap: true })).toBe(true);
  });

  test("a user-stopped turn is never resumed", () => {
    expect(needsFinalAnswer({ ...base, text: "", stopped: true })).toBe(false);
    expect(needsFinalAnswer({ ...base, stopped: true, hitRoundCap: true })).toBe(false);
  });

  test("no tools ran means there is nothing to answer from", () => {
    expect(needsFinalAnswer({ ...base, text: "", toolsRun: 0 })).toBe(false);
  });

  test("prompt forbids further tool calls", () => {
    expect(finalAnswerPrompt(true)).toContain("maximum");
    expect(finalAnswerPrompt(false).toLowerCase()).toContain("without saying anything");
    expect(finalAnswerPrompt(true).toLowerCase()).toContain("do not emit any tool call");
  });
});
