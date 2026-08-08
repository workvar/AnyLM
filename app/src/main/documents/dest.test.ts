import { describe, expect, test } from "bun:test";
import { standaloneGeneratedDir } from "./dest";
import * as path from "path";

describe("standaloneGeneratedDir", () => {
  test("joins Documents/AnyLM/generated", () => {
    expect(standaloneGeneratedDir("/Users/x/Documents")).toBe(
      path.join("/Users/x/Documents", "AnyLM", "generated")
    );
  });
});
