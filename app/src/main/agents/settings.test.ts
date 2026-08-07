import { describe, expect, test } from "bun:test";
import { modelForRole, resolveAgentSettings } from "./settings";
import type { AgentSettings } from "./types";

const base: AgentSettings = {
  enabled: true,
  maxParallel: 2,
  models: { planner: null, router: "tiny", toolExecutor: null, synthesize: null },
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
