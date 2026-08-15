import { describe, expect, test } from "bun:test";
import { displayUrl } from "./linkify";

describe("displayUrl", () => {
  test("drops the scheme and the trailing slash", () => {
    expect(displayUrl("https://example.com/")).toBe("example.com");
  });

  test("truncates long URLs", () => {
    const long = "https://example.com/" + "a".repeat(200);
    expect(displayUrl(long).length).toBe(60);
    expect(displayUrl(long).endsWith("…")).toBe(true);
  });
});
