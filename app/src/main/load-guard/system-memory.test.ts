import { describe, expect, test } from "bun:test";
import { systemRamUsedPercent } from "./system-memory";

describe("systemRamUsedPercent", () => {
  test("computes used percent from total/free", () => {
    const pct = systemRamUsedPercent({
      totalmem: () => 1000,
      freemem: () => 100,
    });
    expect(pct).toBe(90);
  });

  test("rounds to nearest int", () => {
    const pct = systemRamUsedPercent({
      totalmem: () => 1000,
      freemem: () => 333,
    });
    expect(pct).toBe(67);
  });

  test("clamps free > total to 0% used", () => {
    const pct = systemRamUsedPercent({
      totalmem: () => 1000,
      freemem: () => 2000,
    });
    expect(pct).toBe(0);
  });

  test("fail open on zero/negative total", () => {
    expect(systemRamUsedPercent({ totalmem: () => 0, freemem: () => 0 })).toBeNull();
    expect(systemRamUsedPercent({ totalmem: () => -1, freemem: () => 0 })).toBeNull();
  });

  test("fail open when deps throw", () => {
    expect(
      systemRamUsedPercent({
        totalmem: () => {
          throw new Error("boom");
        },
        freemem: () => 1,
      })
    ).toBeNull();
  });

  test("fail open on non-finite values", () => {
    expect(systemRamUsedPercent({ totalmem: () => NaN, freemem: () => 1 })).toBeNull();
  });
});
