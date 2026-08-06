import { describe, expect, test } from "bun:test";
import { dedupeApps, sortApps } from "./open-with";

test("dedupeApps by id", () => {
  expect(
    dedupeApps([
      { id: "a", name: "Preview" },
      { id: "a", name: "Preview" },
      { id: "b", name: "Chrome" },
    ])
  ).toHaveLength(2);
});

test("sortApps by name", () => {
  expect(
    sortApps([
      { id: "a", name: "Preview" },
      { id: "b", name: "Chrome" },
    ])
  ).toEqual([
    { id: "b", name: "Chrome" },
    { id: "a", name: "Preview" },
  ]);
});
