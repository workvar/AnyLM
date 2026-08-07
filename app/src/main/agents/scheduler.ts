import type { AgentStep } from "./types";

export function nextWave(steps: AgentStep[], done: Set<string>, maxParallel: number): AgentStep[] {
  const ready = steps.filter(
    (step) => !done.has(step.id) && step.dependsOn.every((dep) => done.has(dep))
  );
  return ready.slice(0, maxParallel);
}
