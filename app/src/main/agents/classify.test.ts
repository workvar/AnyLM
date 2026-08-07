import { describe, expect, test } from "bun:test";
import { parseClassify } from "./classify";

test("parseClassify reads single/multi", () => {
  expect(parseClassify('{"mode":"multi"}')).toBe("multi");
  expect(parseClassify("SINGLE")).toBe("single");
  expect(parseClassify("nope")).toBeNull();
});
