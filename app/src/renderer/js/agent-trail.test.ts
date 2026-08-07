import { describe, expect, test } from "bun:test";
import { summarizeAgentTrail } from "./agent-trail";

describe("summarizeAgentTrail", () => {
  test("summarize collapses plan", () => {
    const s = summarizeAgentTrail([
      {
        kind: "agent:plan",
        steps: [
          { id: "1", goal: "A", stepKind: "memory" },
          { id: "2", goal: "B", stepKind: "retrieve" },
        ],
      },
      { kind: "agent:step", id: "1", goal: "A", stepKind: "memory", parallelGroup: 0, status: "done" },
      { kind: "agent:step", id: "2", goal: "B", stepKind: "retrieve", parallelGroup: 0, status: "running" },
    ]);
    expect(s?.title).toMatch(/Planned 2 steps/i);
    expect(s?.lines.length).toBeGreaterThan(0);
  });

  test("returns null without a plan event", () => {
    expect(summarizeAgentTrail([{ kind: "status", text: "Working…" }])).toBeNull();
    expect(summarizeAgentTrail([])).toBeNull();
  });

  test("reflects latest status per step and includes the merge line once merged", () => {
    const s = summarizeAgentTrail([
      {
        kind: "agent:plan",
        steps: [
          { id: "1", goal: "Look up docs", stepKind: "retrieve" },
          { id: "2", goal: "Recall context", stepKind: "memory" },
        ],
      },
      { kind: "agent:step", id: "1", goal: "Look up docs", stepKind: "retrieve", parallelGroup: 1, status: "running" },
      { kind: "agent:step", id: "2", goal: "Recall context", stepKind: "memory", parallelGroup: 1, status: "running" },
      { kind: "agent:step", id: "1", goal: "Look up docs", stepKind: "retrieve", parallelGroup: 1, status: "done" },
      {
        kind: "agent:step",
        id: "2",
        goal: "Recall context",
        stepKind: "memory",
        parallelGroup: 1,
        status: "error",
        detail: "timed out",
      },
      { kind: "agent:merge" },
    ]);
    expect(s).not.toBeNull();
    expect(s?.lines.some((l) => l.includes("Look up docs"))).toBe(true);
    expect(s?.lines.some((l) => l.includes("timed out"))).toBe(true);
    expect(s?.lines[(s?.lines.length ?? 1) - 1]).toMatch(/combin/i);
  });

  test("singular step count reads naturally", () => {
    const s = summarizeAgentTrail([
      { kind: "agent:plan", steps: [{ id: "1", goal: "Solo", stepKind: "tool" }] },
    ]);
    expect(s?.title).toBe("Planned 1 step");
  });
});
