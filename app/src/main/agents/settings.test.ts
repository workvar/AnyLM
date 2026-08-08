import { describe, expect, test } from "bun:test";
import { clampKillPercent } from "../load-guard/clamp";
import { modelForRole, resolveAgentSettings } from "./settings";
import type { AgentSettings } from "./types";

const base: AgentSettings = {
  enabled: true,
  maxParallel: 2,
  models: { planner: null, router: "tiny", toolExecutor: null, synthesize: null },
  loadProtection: { enabled: true, killPercent: 90 },
};

const baseWithLp: AgentSettings = {
  ...base,
  loadProtection: { enabled: true, killPercent: 90 },
};

describe("modelForRole", () => {
  test("falls back to chat model when null", () => {
    expect(modelForRole(base, "planner", "llama3.2")).toBe("llama3.2");
  });
  test("uses configured role model", () => {
    expect(modelForRole(base, "router", "llama3.2")).toBe("tiny");
  });
});

describe("resolveAgentSettings", () => {
  test("clamps maxParallel to at least 1", () => {
    const r = resolveAgentSettings({
      agents: { ...base, maxParallel: 0 },
    } as AppSettings);
    expect(r.maxParallel).toBe(1);
  });
});

describe("resolveAgentSettings loadProtection", () => {
  test("defaults missing loadProtection to enabled + 90", () => {
    const r = resolveAgentSettings({
      agents: { enabled: true, maxParallel: 2, models: base.models },
    } as AppSettings);
    expect(r.loadProtection).toEqual({ enabled: true, killPercent: 90 });
  });

  test("clamps killPercent on resolve", () => {
    const r = resolveAgentSettings({
      agents: {
        ...baseWithLp,
        loadProtection: { enabled: true, killPercent: 10 },
      },
    } as AppSettings);
    expect(r.loadProtection.killPercent).toBe(50);
  });

  test("enabled false is preserved (Load cutoff off)", () => {
    const r = resolveAgentSettings({
      agents: {
        ...baseWithLp,
        loadProtection: { enabled: false, killPercent: 90 },
      },
    } as AppSettings);
    expect(r.loadProtection.enabled).toBe(false);
  });

  test("load cutoff defaults on when loadProtection.enabled omitted", () => {
    const r = resolveAgentSettings({
      agents: {
        ...baseWithLp,
        loadProtection: { killPercent: 85 } as LoadProtectionSettings,
      },
    } as AppSettings);
    expect(r.loadProtection.enabled).toBe(true);
    expect(r.loadProtection.killPercent).toBe(85);
  });
});

test("clampKillPercent agrees with resolve for out-of-range patch", () => {
  expect(clampKillPercent(120)).toBe(99);
});
