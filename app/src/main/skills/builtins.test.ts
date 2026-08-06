import { describe, expect, test } from "bun:test";
import { BUILTIN_SKILLS } from "./builtins";

describe("BUILTIN_SKILLS", () => {
  test("includes web-research without connector", () => {
    const s = BUILTIN_SKILLS.find((x) => x.id === "web-research");
    expect(s).toBeTruthy();
    expect(s!.name).toBe("Web research");
    expect((s as { connector?: string }).connector).toBeUndefined();
    expect(s!.toolNames).toEqual(["web_search", "http_fetch"]);
    expect(s!.tools).toEqual([]);
    expect(s!.instructions).toMatch(/http_fetch/);
    expect(s!.instructions).toMatch(/web_search/);
    expect(s!.instructions.toLowerCase()).toMatch(/do it|go ahead/);
    expect(s!.instructions.toLowerCase()).toMatch(/json|example/);
  });

  test("calendar and outlook unchanged connectors", () => {
    expect(BUILTIN_SKILLS.find((x) => x.id === "google-calendar")?.connector).toBe(
      "google-calendar"
    );
    expect(BUILTIN_SKILLS.find((x) => x.id === "outlook")?.connector).toBe("outlook");
  });
});
