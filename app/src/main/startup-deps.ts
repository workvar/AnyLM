// Verifies bundled backends (Chroma, graph store) and probes external deps
// (Ollama) before the main window opens. Bundled services are started here;
// failures are soft — the app still launches, but memory features degrade.
import * as chroma from "./chroma";
import * as chromaServer from "./chroma-server";
import * as graphStore from "./graph/store";
import { resolveSetupState, type OllamaInstall, type OllamaSetupState } from "./ollama-setup/detect";

export type DepKind = "bundled" | "external";

export interface DepStatus {
  id: "chroma" | "graph" | "ollama";
  kind: DepKind;
  ok: boolean;
  message: string;
}

export interface StartupDepsReport {
  /** True when every bundled dependency reported ok. */
  ready: boolean;
  deps: DepStatus[];
}

let lastReport: StartupDepsReport | null = null;

function chromaClientLoaded(): boolean {
  try {
    require("chromadb");
    return true;
  } catch {
    return false;
  }
}

function buildReport(deps: DepStatus[]): StartupDepsReport {
  const ready = deps.filter((d) => d.kind === "bundled").every((d) => d.ok);
  return { ready, deps };
}

function ollamaMessage(state: OllamaSetupState): string {
  if (state === "running") return "Ollama is running.";
  if (state === "installed") return "Ollama is installed but not running.";
  return "Ollama is not installed.";
}

/** Pure composition — inject deps for tests. */
export async function checkStartupDeps(deps: {
  chromaBinaryPath: () => string | null;
  startChroma: () => Promise<boolean>;
  chromaReachable: () => Promise<boolean>;
  ensureGraph: () => { ok: boolean; message: string };
  chromaClientOk: () => boolean;
  ollamaReachable: () => Promise<boolean>;
  findOllama: () => OllamaInstall | null;
}): Promise<StartupDepsReport> {
  const statuses: DepStatus[] = [];

  const binary = deps.chromaBinaryPath();
  const clientOk = deps.chromaClientOk();
  if (!binary && !clientOk) {
    statuses.push({
      id: "chroma",
      kind: "bundled",
      ok: false,
      message: "Chroma server binary and client are unavailable.",
    });
  } else if (!binary) {
    statuses.push({
      id: "chroma",
      kind: "bundled",
      ok: false,
      message: "Chroma server binary missing from the install bundle.",
    });
  } else {
    await deps.startChroma();
    const reachable = await deps.chromaReachable();
    statuses.push({
      id: "chroma",
      kind: "bundled",
      ok: reachable && clientOk,
      message: reachable
        ? clientOk
          ? "Chroma memory backend is ready."
          : "Chroma server is up but the client library failed to load."
        : "Chroma server did not become reachable.",
    });
  }

  const graph = deps.ensureGraph();
  statuses.push({
    id: "graph",
    kind: "bundled",
    ok: graph.ok,
    message: graph.message,
  });

  const reachable = await deps.ollamaReachable();
  const install = deps.findOllama();
  const state = resolveSetupState(reachable, install);
  statuses.push({
    id: "ollama",
    kind: "external",
    ok: state === "running",
    message: ollamaMessage(state),
  });

  return buildReport(statuses);
}

/** Runtime wiring — call once from main before createWindow(). */
export async function ensureReady(): Promise<StartupDepsReport> {
  const ollamaSetup = await import("./ollama-setup/runtime");
  const report = await checkStartupDeps({
    chromaBinaryPath: chromaServer.binaryPath,
    startChroma: chromaServer.start,
    chromaReachable: chroma.available,
    ensureGraph: graphStore.ensureReady,
    chromaClientOk: chromaClientLoaded,
    ollamaReachable: async () => (await ollamaSetup.probeRuntime()).state === "running",
    findOllama: ollamaSetup.findInstall,
  });
  lastReport = report;
  for (const dep of report.deps) {
    const tag = dep.ok ? "ok" : "warn";
    console.log(`[startup-deps] ${dep.id} (${dep.kind}): ${tag} — ${dep.message}`);
  }
  return report;
}

export function getLastReport(): StartupDepsReport | null {
  return lastReport;
}
