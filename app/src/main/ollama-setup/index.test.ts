import { describe, expect, test } from "bun:test";
import { probe, startAndWait } from "./index";

describe("probe", () => {
  test("maps reachable to running", async () => {
    const r = await probe({
      host: "http://127.0.0.1:11434",
      isReachable: async () => true,
      findInstall: () => ({ kind: "binary", path: "/usr/bin/ollama" }),
    });
    expect(r.state).toBe("running");
  });
  test("maps unreachable + install to installed", async () => {
    const r = await probe({
      host: "http://127.0.0.1:11434",
      isReachable: async () => false,
      findInstall: () => ({ kind: "binary", path: "/usr/bin/ollama" }),
    });
    expect(r.state).toBe("installed");
    expect(r.installPath).toBe("/usr/bin/ollama");
  });
});

describe("startAndWait", () => {
  test("ok when becomes reachable", async () => {
    let n = 0;
    const r = await startAndWait({
      platform: "linux",
      findInstall: () => ({ kind: "binary", path: "/usr/bin/ollama" }),
      spawnPlan: async () => {},
      isReachable: async () => ++n >= 2,
      sleep: async () => {},
      timeoutMs: 5000,
      intervalMs: 1,
    });
    expect(r.ok).toBe(true);
  });
  test("fails when never reachable", async () => {
    const r = await startAndWait({
      platform: "linux",
      findInstall: () => ({ kind: "binary", path: "/usr/bin/ollama" }),
      spawnPlan: async () => {},
      isReachable: async () => false,
      sleep: async () => {},
      timeoutMs: 5,
      intervalMs: 1,
    });
    expect(r.ok).toBe(false);
    expect(r.error).toBeTruthy();
  });
  test("fails when not installed", async () => {
    const r = await startAndWait({
      platform: "linux",
      findInstall: () => null,
      spawnPlan: async () => {},
      isReachable: async () => false,
      sleep: async () => {},
      timeoutMs: 5,
      intervalMs: 1,
    });
    expect(r.ok).toBe(false);
  });
});
