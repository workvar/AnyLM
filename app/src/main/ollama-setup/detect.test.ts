import { describe, expect, test } from "bun:test";
import { fallbackPaths, findOllamaBinary, resolveSetupState } from "./detect";

describe("fallbackPaths", () => {
  test("darwin includes homebrew and Applications app", () => {
    const paths = fallbackPaths("darwin", {});
    expect(paths).toContain("/opt/homebrew/bin/ollama");
    expect(paths).toContain("/usr/local/bin/ollama");
    expect(paths).toContain("/Applications/Ollama.app");
  });
  test("linux includes usr bins", () => {
    const paths = fallbackPaths("linux", {});
    expect(paths).toContain("/usr/bin/ollama");
    expect(paths).toContain("/usr/local/bin/ollama");
  });
  test("win32 uses LOCALAPPDATA and ProgramFiles", () => {
    const paths = fallbackPaths("win32", {
      LOCALAPPDATA: "C:\\Users\\a\\AppData\\Local",
      ProgramFiles: "C:\\Program Files",
    });
    expect(paths.some((p) => p.includes("Ollama\\ollama.exe"))).toBe(true);
  });
});

describe("findOllamaBinary", () => {
  test("prefers which() when present", () => {
    const hit = findOllamaBinary({
      platform: "linux",
      env: {},
      pathEnv: "/usr/bin",
      exists: () => false,
      which: () => "/custom/ollama",
    });
    expect(hit).toEqual({ kind: "binary", path: "/custom/ollama" });
  });
  test("falls back to existing path", () => {
    const hit = findOllamaBinary({
      platform: "darwin",
      env: {},
      pathEnv: "",
      exists: (p) => p === "/Applications/Ollama.app",
      which: () => null,
    });
    expect(hit).toEqual({ kind: "app", path: "/Applications/Ollama.app" });
  });
  test("missing when nothing found", () => {
    const hit = findOllamaBinary({
      platform: "linux",
      env: {},
      pathEnv: "",
      exists: () => false,
      which: () => null,
    });
    expect(hit).toBeNull();
  });
});

describe("resolveSetupState", () => {
  test("reachable is running even if no binary found", () => {
    expect(resolveSetupState(true, null)).toBe("running");
  });
  test("unreachable + binary is installed", () => {
    expect(resolveSetupState(false, { kind: "binary", path: "/usr/bin/ollama" })).toBe("installed");
  });
  test("unreachable + nothing is missing", () => {
    expect(resolveSetupState(false, null)).toBe("missing");
  });
});
