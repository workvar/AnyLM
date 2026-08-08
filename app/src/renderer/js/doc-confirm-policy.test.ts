import { describe, expect, test } from "bun:test";
import { openConfirmToken, waitingConfirmLabel } from "./doc-confirm-policy";

describe("doc-confirm-policy", () => {
  test("generate_document exposes the same strip Allow token as other risky tools", () => {
    expect(
      openConfirmToken({
        token: "tok-doc",
        tool: { name: "generate_document" },
      })
    ).toBe("tok-doc");
    expect(
      openConfirmToken({
        token: "tok-shell",
        tool: { name: "run_shell" },
      })
    ).toBe("tok-shell");
  });

  test("waiting label covers generate_document instead of falling through to Working…", () => {
    expect(
      waitingConfirmLabel({
        kind: "confirm",
        token: "t",
        label: "Writing a document",
        tool: { name: "generate_document", description: "" },
        args: {},
      })
    ).toBe("Waiting for approval…");
  });
});
