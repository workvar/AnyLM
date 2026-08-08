import { describe, expect, test } from "bun:test";
import {
  createInFlightMonitor,
  effectiveMaxParallel,
  isOverKillLimit,
  nextSustainedPressure,
} from "./guard";

describe("isOverKillLimit", () => {
  test("null sample fails open", () => {
    expect(isOverKillLimit(null, 90)).toBe(false);
  });
  test("under kill is false", () => {
    expect(isOverKillLimit(89, 90)).toBe(false);
  });
  test("at/over kill is true", () => {
    expect(isOverKillLimit(90, 90)).toBe(true);
    expect(isOverKillLimit(95, 90)).toBe(true);
  });
});

describe("effectiveMaxParallel", () => {
  test("returns configured when disabled or under", () => {
    expect(effectiveMaxParallel(2, { enabled: false, overKill: true })).toBe(2);
    expect(effectiveMaxParallel(2, { enabled: true, overKill: false })).toBe(2);
  });
  test("forces 1 when enabled and over", () => {
    expect(effectiveMaxParallel(4, { enabled: true, overKill: true })).toBe(1);
  });
});

describe("nextSustainedPressure", () => {
  test("single spike then under does not trip", () => {
    let s = { prevOver: false };
    let r = nextSustainedPressure(s, 95, 90);
    expect(r.trip).toBe(false);
    expect(r.over).toBe(true);
    r = nextSustainedPressure(r.state, 80, 90);
    expect(r.trip).toBe(false);
    expect(r.over).toBe(false);
  });

  test("two consecutive overs trip", () => {
    let s = { prevOver: false };
    let r = nextSustainedPressure(s, 95, 90);
    expect(r.trip).toBe(false);
    r = nextSustainedPressure(r.state, 92, 90);
    expect(r.trip).toBe(true);
    expect(r.over).toBe(true);
  });

  test("null sample fails open and clears prevOver", () => {
    const r = nextSustainedPressure({ prevOver: true }, null, 90);
    expect(r.trip).toBe(false);
    expect(r.over).toBe(false);
    expect(r.state.prevOver).toBe(false);
  });
});

describe("createInFlightMonitor", () => {
  test("trips after two over samples and calls onTrip once", () => {
    const calls: number[] = [];
    const timers: Array<() => void> = [];
    const monitor = createInFlightMonitor({
      enabled: true,
      killPercent: 90,
      intervalMs: 2000,
      sample: () => 95,
      onTrip: () => calls.push(1),
      setIntervalFn: (fn: () => void) => {
        timers.push(fn);
        return 1 as unknown as ReturnType<typeof setInterval>;
      },
      clearIntervalFn: () => {},
    });
    monitor.start();
    expect(timers.length).toBe(1);
    timers[0](); // first over — arm
    expect(calls).toEqual([]);
    timers[0](); // second over — trip
    expect(calls).toEqual([1]);
    timers[0](); // already tripped — no second call
    expect(calls).toEqual([1]);
    monitor.stop();
  });

  test("disabled never samples", () => {
    let samples = 0;
    const timers: Array<() => void> = [];
    const monitor = createInFlightMonitor({
      enabled: false,
      killPercent: 90,
      sample: () => {
        samples += 1;
        return 99;
      },
      onTrip: () => {},
      setIntervalFn: (fn: () => void) => {
        timers.push(fn);
        return 1 as unknown as ReturnType<typeof setInterval>;
      },
      clearIntervalFn: () => {},
    });
    monitor.start();
    expect(timers.length).toBe(0);
    expect(samples).toBe(0);
  });
});
