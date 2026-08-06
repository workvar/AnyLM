import { describe, expect, test } from "bun:test";
import * as path from "path";

describe("skills registry extraIds", () => {
  test("web-research instructions and tools when only in extraIds", () => {
    const appRoot = path.resolve(import.meta.dir, "../../..");
    const result = Bun.spawnSync({
      cmd: [process.execPath, "run", "./test-fixtures/registry-extra.ts"],
      cwd: appRoot,
      stderr: "pipe",
      stdout: "pipe",
    });

    expect(new TextDecoder().decode(result.stderr)).toBe("");
    expect(result.exitCode).toBe(0);
  });
});
