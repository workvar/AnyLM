import { describe, expect, test } from "bun:test";
import { clampTruncateChars } from "./clamp";

describe("clampTruncateChars", () => {
  test("defaults invalid to 200", () => {
    expect(clampTruncateChars(undefined)).toBe(200);
    expect(clampTruncateChars("nope")).toBe(200);
  });
  test("clamps to 50..500", () => {
    expect(clampTruncateChars(10)).toBe(50);
    expect(clampTruncateChars(200)).toBe(200);
    expect(clampTruncateChars(9999)).toBe(500);
  });
});
