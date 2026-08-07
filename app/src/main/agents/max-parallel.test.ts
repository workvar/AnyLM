import { describe, expect, test } from "bun:test";
import { clampMaxParallel } from "./max-parallel";

describe("clampMaxParallel", () => {
  test("defaults undefined to 2", () => {
    expect(clampMaxParallel(undefined)).toBe(2);
  });

  test("treats 0 as 1", () => {
    expect(clampMaxParallel(0)).toBe(1);
  });

  test("clamps negatives to 1", () => {
    expect(clampMaxParallel(-3)).toBe(1);
  });

  test("passes through valid values", () => {
    expect(clampMaxParallel(3)).toBe(3);
    expect(clampMaxParallel(2)).toBe(2);
  });

  test("invalid values fall back to default", () => {
    expect(clampMaxParallel("nope")).toBe(2);
    expect(clampMaxParallel(NaN)).toBe(2);
  });

  test("write and resolve paths agree for patch maxParallel 0", () => {
    const prev = 2;
    const patch = 0;
    const writeValue = clampMaxParallel(patch ?? prev);
    const resolveValue = clampMaxParallel(patch ?? 2);
    expect(writeValue).toBe(1);
    expect(resolveValue).toBe(1);
    expect(writeValue).toBe(resolveValue);
  });
});
