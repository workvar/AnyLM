import { resolveSetupState, type OllamaInstall } from "./detect";
import { planStart, type StartPlan } from "./start";

export async function probe(deps: {
  host: string;
  isReachable: () => Promise<boolean>;
  findInstall: () => OllamaInstall | null;
}) {
  const install = deps.findInstall();
  const reachable = await deps.isReachable();
  return {
    state: resolveSetupState(reachable, install),
    host: deps.host,
    installPath: install ? install.path : null,
  };
}

export async function startAndWait(deps: {
  platform: NodeJS.Platform;
  findInstall: () => OllamaInstall | null;
  spawnPlan: (plan: StartPlan) => Promise<void>;
  isReachable: () => Promise<boolean>;
  sleep: (ms: number) => Promise<void>;
  timeoutMs?: number;
  intervalMs?: number;
}): Promise<{ ok: boolean; error?: string }> {
  const install = deps.findInstall();
  const plan = planStart(deps.platform, install);
  if (!plan) return { ok: false, error: "Ollama is not installed." };
  try {
    await deps.spawnPlan(plan);
  } catch (e) {
    return { ok: false, error: (e as Error).message || "Failed to start Ollama." };
  }
  const timeoutMs = deps.timeoutMs ?? 20_000;
  const intervalMs = deps.intervalMs ?? 500;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await deps.isReachable()) return { ok: true };
    await deps.sleep(intervalMs);
  }
  return { ok: false, error: "Ollama did not become reachable in time." };
}
