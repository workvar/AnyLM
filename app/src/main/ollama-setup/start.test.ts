import { describe, expect, test } from "bun:test";
import { planStart } from "./start";

describe("planStart", () => {
  test("darwin prefers open -a when app install", () => {
    expect(planStart("darwin", { kind: "app", path: "/Applications/Ollama.app" })).toEqual({
      command: "open",
      args: ["-a", "Ollama"],
    });
  });
  test("darwin binary uses serve", () => {
    expect(planStart("darwin", { kind: "binary", path: "/opt/homebrew/bin/ollama" })).toEqual({
      command: "/opt/homebrew/bin/ollama",
      args: ["serve"],
    });
  });
  test("linux uses serve", () => {
    expect(planStart("linux", { kind: "binary", path: "/usr/bin/ollama" })).toEqual({
      command: "/usr/bin/ollama",
      args: ["serve"],
    });
  });
  test("win32 launches exe", () => {
    const p = "C:\\Users\\a\\AppData\\Local\\Programs\\Ollama\\ollama.exe";
    expect(planStart("win32", { kind: "binary", path: p })).toEqual({
      command: p,
      args: [],
    });
  });
  test("null install returns null", () => {
    expect(planStart("linux", null)).toBeNull();
  });
});
