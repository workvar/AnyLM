import { describe, expect, test } from "bun:test";
import { clampKillPercent } from "./clamp";

describe("clampKillPercent", () => {
  test("defaults undefined/null to 90", () => {
    expect(clampKillPercent(undefined)).toBe(90);
    expect(clampKillPercent(null)).toBe(90);
  });

  test("clamps below 50 up to 50", () => {
    expect(clampKillPercent(0)).toBe(50);
    expect(clampKillPercent(49)).toBe(50);
  });

  test("clamps above 99 down to 99", () => {
    expect(clampKillPercent(100)).toBe(99);
    expect(clampKillPercent(150)).toBe(99);
  });

  test("passes through valid values and rounds", () => {
    expect(clampKillPercent(90)).toBe(90);
    expect(clampKillPercent(75.4)).toBe(75);
    expect(clampKillPercent(75.6)).toBe(76);
  });

  test("invalid values fall back to default", () => {
    expect(clampKillPercent("nope")).toBe(90);
    expect(clampKillPercent(NaN)).toBe(90);
  });

  test("honors custom fallback then clamps", () => {
    expect(clampKillPercent(undefined, 80)).toBe(80);
    expect(clampKillPercent(10, 80)).toBe(50);
  });
});
