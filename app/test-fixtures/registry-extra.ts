import { mock } from "bun:test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const userData = fs.mkdtempSync(path.join(os.tmpdir(), "anylm-skills-test-"));

try {
  mock.module("electron", () => ({
    app: {
      getPath: () => userData,
    },
  }));

  const skillsRegistry = await import("../src/main/skills/registry");
  skillsRegistry.toggle("web-research", false);

  const block = skillsRegistry.instructionsBlock(["web-research"]);
  if (!/Web research/i.test(block) || !/http_fetch/i.test(block)) {
    throw new Error("extraIds did not add Web research instructions");
  }

  const names = skillsRegistry
    .ollamaTools(["web-research"])
    .map((definition) => definition.function.name);
  if (!names.includes("web_search") || !names.includes("http_fetch")) {
    throw new Error("extraIds did not add Web research tools");
  }

  const allow = skillsRegistry.customToolNames(["web-research"]);
  if (!allow.has("http_fetch") || !allow.has("web_search")) {
    throw new Error("extraIds did not add Web research tool names");
  }

  if (/Web research/i.test(skillsRegistry.instructionsBlock([]))) {
    throw new Error("empty extraIds unexpectedly enabled Web research");
  }
} finally {
  fs.rmSync(userData, { recursive: true, force: true });
}
