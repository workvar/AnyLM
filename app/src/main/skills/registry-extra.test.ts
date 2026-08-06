import { describe, expect, mock, test } from "bun:test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const userData = fs.mkdtempSync(path.join(os.tmpdir(), "anylm-skills-test-"));

mock.module("electron", () => ({
  app: {
    getPath: () => userData,
  },
}));

const skillsRegistry = await import("./registry");

describe("skills registry extraIds", () => {
  test("web-research instructions and tools when only in extraIds", () => {
    // Assumes web-research is globally off in the test userData (default for fresh store).
    // If a prior test enabled it, toggle off first:
    skillsRegistry.toggle("web-research", false);

    const block = skillsRegistry.instructionsBlock(["web-research"]);
    expect(block).toMatch(/Web research/i);
    expect(block.toLowerCase()).toMatch(/http_fetch/);

    const defs = skillsRegistry.ollamaTools(["web-research"]);
    const names = defs.map((d) => d.function.name);
    expect(names).toContain("web_search");
    expect(names).toContain("http_fetch");

    const allow = skillsRegistry.customToolNames(["web-research"]);
    expect(allow.has("http_fetch")).toBe(true);
    expect(allow.has("web_search")).toBe(true);

    const empty = skillsRegistry.instructionsBlock([]);
    expect(empty).not.toMatch(/Web research/i);
  });
});
