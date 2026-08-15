import { describe, expect, test } from "bun:test";
import { detectTheme } from "./detect";
import { getTheme, THEME_IDS } from "./tokens";

describe("detectTheme", () => {
  test("business language picks professional", () => {
    const d = detectTheme("Q3 revenue forecast for the board, with KPIs and client roadmap");
    expect(d.id).toBe("professional");
    expect(d.ambiguous).toBe(false);
  });

  test("research language picks academic", () => {
    const d = detectTheme(
      "Abstract: this literature review tests the hypothesis using an empirical sample size"
    );
    expect(d.id).toBe("academic");
  });

  test("neutral text is ambiguous and falls back to the default", () => {
    const d = detectTheme("Some notes about a thing that happened.");
    expect(d.id).toBe("professional");
    expect(d.ambiguous).toBe(true);
  });

  test("empty input never throws", () => {
    expect(detectTheme("").id).toBe("professional");
    expect(detectTheme(null).ambiguous).toBe(true);
  });
});

describe("getTheme", () => {
  test("unknown ids fall back rather than throwing", () => {
    expect(getTheme("nope").id).toBe("professional");
  });

  test("every theme defines a full palette", () => {
    for (const id of THEME_IDS) {
      const t = getTheme(id);
      expect(t.palette.accentOnDark).toMatch(/^[0-9A-F]{6}$/i);
      expect(t.palette.series.length).toBeGreaterThan(3);
      expect(t.fonts.heading.length).toBeGreaterThan(0);
    }
  });
});
