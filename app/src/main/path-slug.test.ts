import { describe, expect, test } from "bun:test";
import { pathSlug } from "./path-slug";

describe("pathSlug", () => {
  test("spaces become hyphens and lowercased", () => {
    expect(pathSlug("My Project")).toBe("my-project");
  });
  test("strips illegal path chars", () => {
    expect(pathSlug('Report: "Q1"/final')).toBe("report-q1-final");
  });
  test("collapses repeated hyphens and trims", () => {
    expect(pathSlug("  Foo   Bar--Baz  ")).toBe("foo-bar-baz");
  });
  test("empty falls back", () => {
    expect(pathSlug("")).toBe("project");
    expect(pathSlug("***", "document")).toBe("document");
  });
});
