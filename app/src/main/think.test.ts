import { describe, expect, test } from "bun:test";
import { modelSupportsThink } from "./think";

describe("modelSupportsThink", () => {
  test("true for reasoning families", () => {
    expect(modelSupportsThink("deepseek-r1:latest")).toBe(true);
    expect(modelSupportsThink("qwen3:8b")).toBe(true);
    expect(modelSupportsThink("magistral")).toBe(true);
    expect(modelSupportsThink("gpt-oss:20b")).toBe(true);
  });

  test("false for ordinary chat", () => {
    expect(modelSupportsThink("llama3.2:latest")).toBe(false);
    expect(modelSupportsThink("mistral:7b")).toBe(false);
    expect(modelSupportsThink("codellama:7b")).toBe(false);
  });
});
