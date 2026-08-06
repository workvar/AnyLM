import { describe, expect, test } from "bun:test";
import {
  applyActivity,
  formatThought,
  buildSummary,
  toolCountOf,
  thoughtMsOf,
} from "./activity-store";

describe("formatThought", () => {
  test("brief under 1.5s", () => {
    expect(formatThought(800)).toBe("Thought briefly");
  });
  test("seconds when longer", () => {
    expect(formatThought(5200)).toBe("Thought for 5s");
  });
});

describe("thoughtMsOf", () => {
  test("sums thinking end ms", () => {
    expect(
      thoughtMsOf([
        { kind: "thinking", phase: "start" },
        { kind: "thinking", phase: "end", ms: 1200 },
        { kind: "status", text: "Working…" },
        { kind: "thinking", phase: "end", ms: 800 },
      ])
    ).toBe(2000);
  });

  test("ignores thinking start and non-thinking events", () => {
    expect(
      thoughtMsOf([
        { kind: "thinking", phase: "start" },
        { kind: "tool", name: "web_search", status: "done", label: "Searching" },
        { kind: "status", text: "Done" },
      ])
    ).toBe(0);
  });
});

describe("applyActivity", () => {
  test("appends status", () => {
    const next = applyActivity([], { kind: "status", text: "Generating…" });
    expect(next).toEqual([{ kind: "status", text: "Generating…" }]);
  });

  test("thinking start then end updates same row", () => {
    let evs = applyActivity([], { kind: "thinking", phase: "start" });
    evs = applyActivity(evs, { kind: "thinking", phase: "end", ms: 3000 });
    expect(evs).toEqual([{ kind: "thinking", phase: "end", ms: 3000 }]);
  });

  test("tool running then done updates matching open tool", () => {
    let evs = applyActivity([], {
      kind: "tool",
      name: "web_search",
      status: "running",
      label: "Searching the web",
      args: { query: "x" },
    });
    evs = applyActivity(evs, {
      kind: "tool",
      name: "web_search",
      status: "done",
      label: "Searching the web",
      output: "ok",
    });
    expect(evs).toHaveLength(1);
    expect(evs[0]).toMatchObject({ status: "done", output: "ok" });
    expect(toolCountOf(evs)).toBe(1);
  });

  test("buildSummary", () => {
    expect(buildSummary(800, 0)).toBe("Thought briefly");
    expect(buildSummary(8000, 3)).toBe("Thought for 8s · 3 tools");
  });
});
