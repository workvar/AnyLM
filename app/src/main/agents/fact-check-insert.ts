import type { AgentPlan, AgentStep } from "./types";

const FETCH_ONLY_RE =
  /\b(just fetch|only fetch|fetch (the )?(page|url) only|download (the )?(page|url))\b/i;

const MAX_STEPS_DEFAULT = 6;

export function insertFactChecks(
  plan: AgentPlan,
  userText: string,
  maxSteps = MAX_STEPS_DEFAULT
): AgentPlan {
  if (FETCH_ONLY_RE.test(userText || "")) return plan;

  const steps = [...plan.steps];
  const researchIds = steps.filter((s) => s.kind === "research").map((s) => s.id);

  for (const rid of researchIds) {
    if (steps.length >= maxSteps) break;
    const hasFc = steps.some(
      (s) => s.kind === "fact_check" && s.dependsOn.includes(rid)
    );
    if (hasFc) continue;

    const id = `fc-${rid}`;
    if (steps.some((s) => s.id === id)) continue;

    const fc: AgentStep = {
      id,
      goal: `Fact check claims from step ${rid}`,
      dependsOn: [rid],
      kind: "fact_check",
    };
    // Insert before synthesize steps when possible; else append
    const synthIdx = steps.findIndex((s) => s.kind === "synthesize");
    if (synthIdx >= 0) steps.splice(synthIdx, 0, fc);
    else steps.push(fc);
  }

  return { steps };
}
