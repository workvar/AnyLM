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
