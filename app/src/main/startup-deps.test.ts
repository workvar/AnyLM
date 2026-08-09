import { describe, expect, test } from "bun:test";
import { checkStartupDeps } from "./startup-deps";

describe("checkStartupDeps", () => {
  test("bundled deps ok when chroma and graph are ready", async () => {
    const report = await checkStartupDeps({
      chromaBinaryPath: () => "/app/chroma",
      startChroma: async () => true,
      chromaReachable: async () => true,
      ensureGraph: () => ({ ok: true, message: "Knowledge graph store is ready." }),
      chromaClientOk: () => true,
      ollamaReachable: async () => true,
      findOllama: () => ({ kind: "binary", path: "/usr/bin/ollama" }),
    });
    expect(report.ready).toBe(true);
    expect(report.deps.find((d) => d.id === "chroma")?.ok).toBe(true);
    expect(report.deps.find((d) => d.id === "graph")?.ok).toBe(true);
    expect(report.deps.find((d) => d.id === "ollama")?.ok).toBe(true);
  });

  test("ready is false when chroma binary is missing", async () => {
    const report = await checkStartupDeps({
      chromaBinaryPath: () => null,
      startChroma: async () => false,
      chromaReachable: async () => false,
      ensureGraph: () => ({ ok: true, message: "Knowledge graph store is ready." }),
      chromaClientOk: () => true,
      ollamaReachable: async () => false,
      findOllama: () => null,
    });
    expect(report.ready).toBe(false);
    expect(report.deps.find((d) => d.id === "chroma")?.ok).toBe(false);
    expect(report.deps.find((d) => d.id === "graph")?.ok).toBe(true);
  });

  test("ollama missing does not block bundled ready", async () => {
    const report = await checkStartupDeps({
      chromaBinaryPath: () => "/app/chroma",
      startChroma: async () => true,
      chromaReachable: async () => true,
      ensureGraph: () => ({ ok: true, message: "Knowledge graph store is ready." }),
      chromaClientOk: () => true,
      ollamaReachable: async () => false,
      findOllama: () => null,
    });
    expect(report.ready).toBe(true);
    expect(report.deps.find((d) => d.id === "ollama")?.ok).toBe(false);
    expect(report.deps.find((d) => d.id === "ollama")?.kind).toBe("external");
  });

  test("graph failure makes ready false", async () => {
    const report = await checkStartupDeps({
      chromaBinaryPath: () => "/app/chroma",
      startChroma: async () => true,
      chromaReachable: async () => true,
      ensureGraph: () => ({ ok: false, message: "Knowledge graph store unavailable: EACCES" }),
      chromaClientOk: () => true,
      ollamaReachable: async () => true,
      findOllama: () => ({ kind: "binary", path: "/usr/bin/ollama" }),
    });
    expect(report.ready).toBe(false);
    expect(report.deps.find((d) => d.id === "graph")?.ok).toBe(false);
  });
});
