// src/renderer/js/has-http-url.test.ts
import { describe, expect, test } from "bun:test";
import { hasHttpUrl } from "./has-http-url";

describe("hasHttpUrl", () => {
  test("https URL", () => {
    expect(hasHttpUrl("see https://yasharyan.dev please")).toBe(true);
  });
  test("http URL", () => {
    expect(hasHttpUrl("http://example.com/path")).toBe(true);
  });
  test("no scheme", () => {
    expect(hasHttpUrl("example.com/foo")).toBe(false);
  });
  test("empty", () => {
    expect(hasHttpUrl("")).toBe(false);
    expect(hasHttpUrl(null as unknown as string)).toBe(false);
  });
});
