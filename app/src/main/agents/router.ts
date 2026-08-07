import type { AgentPlan, AgentStepKind } from "./types";

// Deliberately does NOT match a bare "document" — that word alone shows up
// in plenty of tool goals ("email the signed document", "generate a PDF
// document") that have nothing to do with retrieval. Require a stronger,
// retrieval-specific phrase instead.
const RETRIEVE_PATTERN = /retriev|search (the )?(docs|documents)|rag|project (doc|context)|knowledge base/i;
const MEMORY_PATTERN = /memor|prior (chat|decision)|what we (said|decided)/i;
const SYNTHESIZE_PATTERN = /synthes|final answer|write the reply|compose/i;

function kindForGoal(goal: string): AgentStepKind {
  if (RETRIEVE_PATTERN.test(goal)) return "retrieve";
  if (MEMORY_PATTERN.test(goal)) return "memory";
  if (SYNTHESIZE_PATTERN.test(goal)) return "synthesize";
  return "tool";
}

export function assignKinds(plan: AgentPlan): AgentPlan {
  return {
    steps: plan.steps.map((step) => ({
      ...step,
      kind: kindForGoal(step.goal),
    })),
  };
}
