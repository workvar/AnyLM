import { describe, expect, test } from "bun:test";
import { resolveWorkingStrip } from "./working-strip-mode";

describe("resolveWorkingStrip", () => {
  test("open busy ignores background others", () => {
    const state = resolveWorkingStrip({
      openBusy: true,
      openLabel: "Reasoning…",
      openConfirmToken: "tok",
      others: [
        { status: "working", title: "Other" },
        { status: "waiting", title: "Wait" },
      ],
    });
    expect(state).toEqual({
      mode: "open",
      label: "Reasoning…",
      confirmToken: "tok",
    });
  });

  test("idle with working backgrounds → compact N Working", () => {
    const state = resolveWorkingStrip({
      openBusy: false,
      others: [
        { status: "working", title: "Alpha" },
        { status: "working", title: "Beta" },
      ],
    });
    expect(state).toEqual({
      mode: "compact",
      title: "2 Working",
      label: "Alpha, Beta",
    });
  });

  test("idle with waiting only → compact N Waiting", () => {
    const state = resolveWorkingStrip({
      openBusy: false,
      others: [{ status: "waiting", title: "Ask me" }],
    });
    expect(state).toEqual({
      mode: "compact",
      title: "1 Waiting",
      label: "Ask me",
    });
  });

  test("idle with mixed → compact N active", () => {
    const state = resolveWorkingStrip({
      openBusy: false,
      others: [
        { status: "working", title: "A" },
        { status: "waiting", title: "B" },
      ],
    });
    expect(state).toEqual({
      mode: "compact",
      title: "2 active",
      label: "A, B",
    });
  });

  test("idle empty → null", () => {
    expect(resolveWorkingStrip({ openBusy: false, others: [] })).toBeNull();
  });
});
