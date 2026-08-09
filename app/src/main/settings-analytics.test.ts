import { describe, expect, test } from "bun:test";
import { mergeSettings } from "./settings";

const expectedAnalyticsDefaults = {
  productUsage: true,
  reliability: true,
  chatEvents: true,
  titles: true,
  modelAndTokens: true,
  truncatedMessageText: false,
  truncateChars: 200,
};

describe("mergeSettings analytics", () => {
  test("older settings files missing analytics get defaults", () => {
    const merged = mergeSettings({ theme: "dark" });
    expect(merged.analyticsConsent).toBe(null);
    expect(merged.analytics).toEqual(expectedAnalyticsDefaults);
  });

  test("partial analytics deep-merges with defaults", () => {
    const merged = mergeSettings({
      analytics: { productUsage: false },
    });
    expect(merged.analytics).toEqual({
      ...expectedAnalyticsDefaults,
      productUsage: false,
    });
  });

  test("clamps truncateChars on merge", () => {
    const merged = mergeSettings({
      analytics: { truncateChars: 10 },
    });
    expect(merged.analytics.truncateChars).toBe(50);
  });

  test("preserves analyticsConsent when set", () => {
    expect(mergeSettings({ analyticsConsent: true }).analyticsConsent).toBe(true);
    expect(mergeSettings({ analyticsConsent: false }).analyticsConsent).toBe(false);
  });
});
