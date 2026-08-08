// src/renderer/js/model-lock-message.test.ts
import { describe, expect, test } from "bun:test";
import { modelLockPopoverMessage } from "./model-lock-message";

describe("modelLockPopoverMessage", () => {
  test("null when unlocked", () => {
    expect(modelLockPopoverMessage({ started: false, projectLocked: false })).toBeNull();
  });
  test("started wins over project lock", () => {
    expect(modelLockPopoverMessage({ started: true, projectLocked: true })).toBe(
      "Models cannot be changed after conversation has started."
    );
  });
  test("started alone", () => {
    expect(modelLockPopoverMessage({ started: true, projectLocked: false })).toBe(
      "Models cannot be changed after conversation has started."
    );
  });
  test("project lock alone", () => {
    expect(modelLockPopoverMessage({ started: false, projectLocked: true })).toBe(
      "Model is locked for this project."
    );
  });
});
