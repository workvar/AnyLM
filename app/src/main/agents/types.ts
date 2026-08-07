export type AgentStepKind = "memory" | "retrieve" | "tool" | "synthesize";

export interface AgentStep {
  id: string;
  goal: string;
  dependsOn: string[];
  kind: AgentStepKind;
  toolHint?: string;
}

export interface AgentPlan {
  steps: AgentStep[];
}

export interface StepResult {
  id: string;
  ok: boolean;
  output: string;
  error?: string;
  /** Token usage the step's own model calls incurred (tool-calling rounds); 0/absent for memory/retrieve steps, which make no model calls. */
  promptTokens?: number;
  completionTokens?: number;
}

export type AgentRole = "planner" | "router" | "toolExecutor" | "synthesize";

export interface AgentModelMap {
  planner: string | null;
  router: string | null;
  toolExecutor: string | null;
  synthesize: string | null;
}

export interface AgentSettings {
  enabled: boolean;
  maxParallel: number;
  models: AgentModelMap;
}
