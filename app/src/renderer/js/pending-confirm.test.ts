import { describe, expect, test } from "bun:test";
import { shouldClearPendingOnToolDone } from "./pending-confirm";

describe("shouldClearPendingOnToolDone", () => {
  const pending = { tool: { name: "run_shell" } };

  test("keeps pending when a parallel same-name tool succeeds", () => {
    expect(
      shouldClearPendingOnToolDone(pending, {
        kind: "tool",
        status: "done",
        name: "run_shell",
        output: "/bin/sh: pdftk: command not found",
      })
    ).toBe(false);
  });

  test("clears pending when the tool reports the user declined", () => {
    expect(
      shouldClearPendingOnToolDone(pending, {
        kind: "tool",
        status: "done",
        name: "run_shell",
        output: "The user declined to run this tool.",
      })
    ).toBe(true);
  });

  test("ignores other tool names and non-done events", () => {
    expect(
      shouldClearPendingOnToolDone(pending, {
        kind: "tool",
        status: "done",
        name: "read_file",
        output: "The user declined to run this tool.",
      })
    ).toBe(false);
    expect(
      shouldClearPendingOnToolDone(pending, {
        kind: "tool",
        status: "running",
        name: "run_shell",
        output: "The user declined to run this tool.",
      })
    ).toBe(false);
  });
});
