import { describe, expect, test } from "bun:test";
import {
  clampCustomizeStep,
  nextCustomizeStep,
  prevCustomizeStep,
  customizePrimaryLabel,
} from "./customize-steps";

describe("customize steps", () => {
  test("clamp maps out-of-range to 1..3", () => {
    expect(clampCustomizeStep(0)).toBe(1);
    expect(clampCustomizeStep(99)).toBe(3);
    expect(clampCustomizeStep(2)).toBe(2);
  });

  test("next and prev stay in range", () => {
    expect(nextCustomizeStep(1)).toBe(2);
    expect(nextCustomizeStep(3)).toBe(3);
    expect(prevCustomizeStep(1)).toBe(1);
    expect(prevCustomizeStep(3)).toBe(2);
  });

  test("primary label is Next then Done", () => {
    expect(customizePrimaryLabel(1)).toBe("Next");
    expect(customizePrimaryLabel(2)).toBe("Next");
    expect(customizePrimaryLabel(3)).toBe("Done");
  });
});
