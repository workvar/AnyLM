import type { AgentPlan, AgentStepKind } from "./types";

const RESEARCH_PATTERN = /\bresearch\b|find sources|web search|official docs/i;
const FACT_CHECK_PATTERN = /\bfact[- ]?check\b|\bverify (the )?claims?\b|\bcross[- ]?check\b/i;
const SUMMARIZE_PATTERN = /\bsummarize\b|\btl;?dr\b|\bcondense\b|\bbrief (me )?on\b/i;
const DOCUMENT_PATTERN =
  /\bgenerate_document\b|\b(write|generate|draft)\b.*\b(pdf|docx|report|brief|memo|document)\b|\b(pdf|docx)\b.*\b(brief|report|memo)\b/i;
// Deliberately does NOT match a bare "document" — that word alone shows up
// in plenty of tool goals ("email the signed document", "generate a PDF
// document") that have nothing to do with retrieval. Require a stronger,
// retrieval-specific phrase instead.
const RETRIEVE_PATTERN = /retriev|search (the )?(docs|documents)|rag|project (doc|context)|knowledge base/i;
const MEMORY_PATTERN = /memor|prior (chat|decision)|what we (said|decided)/i;
const SYNTHESIZE_PATTERN = /synthes|final answer|write the reply|compose/i;

function kindFromPatterns(goal: string): AgentStepKind {
  if (RESEARCH_PATTERN.test(goal)) return "research";
  if (FACT_CHECK_PATTERN.test(goal)) return "fact_check";
  if (SUMMARIZE_PATTERN.test(goal)) return "summarize";
  if (DOCUMENT_PATTERN.test(goal)) return "document";
  if (RETRIEVE_PATTERN.test(goal)) return "retrieve";
  if (MEMORY_PATTERN.test(goal)) return "memory";
  if (SYNTHESIZE_PATTERN.test(goal)) return "synthesize";
  return "tool";
}

function resolveKind(goal: string, planned: AgentStepKind): AgentStepKind {
  const fromGoal = kindFromPatterns(goal);
  if (fromGoal !== "tool") return fromGoal;
  if (planned && planned !== "tool") return planned;
  return "tool";
}

export function assignKinds(plan: AgentPlan): AgentPlan {
  return {
    steps: plan.steps.map((step) => ({
      ...step,
      kind: resolveKind(step.goal, step.kind),
    })),
  };
}
