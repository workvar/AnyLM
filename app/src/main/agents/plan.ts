import type { AgentPlan, AgentStep, AgentStepKind } from "./types";

const VALID_KINDS = new Set<AgentStepKind>([
  "memory",
  "retrieve",
  "tool",
  "synthesize",
  "research",
  "fact_check",
  "summarize",
  "document",
]);

function stripMarkdownFences(raw: string): string {
  const trimmed = raw.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/);
  return fenceMatch ? fenceMatch[1].trim() : trimmed;
}

function coerceKind(value: unknown): AgentStepKind {
  if (typeof value === "string" && VALID_KINDS.has(value as AgentStepKind)) {
    return value as AgentStepKind;
  }
  return "tool";
}

function normalizeDependsOn(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((d): d is string => typeof d === "string");
}

function parseStep(raw: unknown): AgentStep | null {
  if (typeof raw !== "object" || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  const id = typeof obj.id === "string" ? obj.id.trim() : "";
  const goal = typeof obj.goal === "string" ? obj.goal.trim() : "";
  if (!id || !goal) return null;
  return {
    id,
    goal,
    dependsOn: normalizeDependsOn(obj.dependsOn),
    kind: coerceKind(obj.kind),
    ...(typeof obj.toolHint === "string" ? { toolHint: obj.toolHint } : {}),
  };
}

export function parsePlan(raw: string): AgentPlan | null {
  try {
    const parsed = JSON.parse(stripMarkdownFences(raw));
    if (typeof parsed !== "object" || parsed === null || !Array.isArray(parsed.steps)) {
      return null;
    }
    const steps: AgentStep[] = [];
    for (const step of parsed.steps) {
      const parsedStep = parseStep(step);
      if (!parsedStep) return null;
      steps.push(parsedStep);
    }
    return { steps };
  } catch {
    return null;
  }
}
