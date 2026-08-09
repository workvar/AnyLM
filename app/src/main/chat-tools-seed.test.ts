import { describe, expect, test } from "bun:test";
import { resolveNewChatUseTools } from "./chat-tools-seed";

describe("resolveNewChatUseTools", () => {
  test("explicit true wins over default false", () => {
    expect(resolveNewChatUseTools(true, false)).toBe(true);
  });
  test("explicit false wins over default true", () => {
    expect(resolveNewChatUseTools(false, true)).toBe(false);
  });
  test("undefined uses default", () => {
    expect(resolveNewChatUseTools(undefined, true)).toBe(true);
    expect(resolveNewChatUseTools(undefined, false)).toBe(false);
  });
});
