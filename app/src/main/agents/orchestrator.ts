import { nextWave } from "./scheduler";
import { insertFactChecks } from "./fact-check-insert";
import type { AgentPlan, AgentStep, StepResult } from "./types";

export interface OrchestratorDeps {
  maxParallel: number;
  /** Optional load-protection hook: re-sample before each wave. */
  beforeWave?: () => { maxParallel: number; softStop: boolean };
  planTurn: (userText: string) => Promise<AgentPlan | null>;
  assignKinds: (plan: AgentPlan) => AgentPlan;
  runStep: (step: AgentStep) => Promise<StepResult>;
  synthesize: (ctx: { userText: string }, results: StepResult[]) => Promise<string>;
  act: (event: ActivityEvent) => void;
  isCancelled: () => boolean;
}

export async function runOrchestratedTurn(
  userText: string,
  deps: OrchestratorDeps
): Promise<{ text: string; fellBack: boolean }> {
  // A thrown error here (Ollama down, missing model, network hiccup) must
  // degrade to the single-agent path exactly like a malformed-JSON plan —
  // not surface as a hard chat:error — so soft-fail it the same way.
  let plan: AgentPlan | null;
  try {
    plan = await deps.planTurn(userText);
  } catch {
    plan = null;
  }
  if (!plan) {
    return { text: "", fellBack: true };
  }

  const assigned = insertFactChecks(deps.assignKinds(plan), userText);
  const steps = assigned.steps;

  deps.act({
    kind: "agent:plan",
    steps: steps.map((s) => ({ id: s.id, goal: s.goal, stepKind: s.kind })),
  });

  const runnableSteps = steps.filter((s) => s.kind !== "synthesize");
  const done = new Set<string>();
  const results: StepResult[] = [];
  let parallelGroup = 0;

  while (done.size < runnableSteps.length) {
    if (deps.isCancelled()) {
      return { text: "", fellBack: false };
    }

    let maxParallel = deps.maxParallel;
    if (deps.beforeWave) {
      const decision = deps.beforeWave();
      maxParallel = decision.maxParallel;
      if (decision.softStop || deps.isCancelled()) {
        return { text: "", fellBack: false };
      }
    }

    const wave = nextWave(runnableSteps, done, maxParallel);
    if (wave.length === 0) break;

    parallelGroup += 1;

    for (const step of wave) {
      deps.act({
        kind: "agent:step",
        id: step.id,
        goal: step.goal,
        stepKind: step.kind,
        parallelGroup,
        status: "running",
      });
    }

    const waveResults = await Promise.all(
      wave.map(async (step) => {
        try {
          return await deps.runStep(step);
        } catch (err) {
          return {
            id: step.id,
            ok: false,
            output: "",
            error: err instanceof Error ? err.message : String(err),
          };
        }
      })
    );

    for (let i = 0; i < wave.length; i++) {
      const step = wave[i];
      const result = waveResults[i];
      results.push(result);
      done.add(step.id);
      deps.act({
        kind: "agent:step",
        id: step.id,
        goal: step.goal,
        stepKind: step.kind,
        parallelGroup,
        status: result.ok ? "done" : "error",
        ...(result.error ? { detail: result.error } : {}),
      });
    }
  }

  // Re-check right before merge/synthesize: the wave loop only checks at the
  // top of each iteration, so a stop landing after the last wave finishes
  // would otherwise still pay for a full synthesis generation.
  if (deps.isCancelled()) {
    return { text: "", fellBack: false };
  }

  deps.act({ kind: "agent:merge" });
  const text = await deps.synthesize({ userText }, results);
  return { text, fellBack: false };
}
