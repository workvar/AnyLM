import { describe, expect, test } from "bun:test";
import { analyticsAvailable } from "./availability";

describe("analyticsAvailable", () => {
  test("true when GA enabled", () => {
    expect(analyticsAvailable({ gaEnabled: true, clarityId: "" })).toBe(true);
  });

  test("true when Clarity id present", () => {
    expect(analyticsAvailable({ gaEnabled: false, clarityId: "abc123" })).toBe(true);
  });

  test("true when both GA and Clarity configured", () => {
    expect(analyticsAvailable({ gaEnabled: true, clarityId: "abc123" })).toBe(true);
  });

  test("false when neither GA nor Clarity configured", () => {
    expect(analyticsAvailable({ gaEnabled: false, clarityId: "" })).toBe(false);
  });
});
