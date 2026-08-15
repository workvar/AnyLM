import { describe, expect, test } from "bun:test";
import { searchKey, MAX_SEARCHES_PER_TURN } from "./search-budget";

describe("searchKey", () => {
  test("ignores word order, case and filler words", () => {
    expect(searchKey("What is Agentic Commerce")).toBe(searchKey("agentic commerce"));
    expect(searchKey("Agentic Commerce definition")).toBe(
      searchKey("the definition of agentic commerce?")
    );
  });

  test("keeps genuinely different queries apart", () => {
    expect(searchKey("agentic commerce risks")).not.toBe(
      searchKey("agentic commerce benefits")
    );
  });

  test("budget leaves room for a real multi-angle search", () => {
    expect(MAX_SEARCHES_PER_TURN).toBeGreaterThanOrEqual(4);
  });
});
