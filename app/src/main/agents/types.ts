export type AgentStepKind =
  | "memory"
  | "retrieve"
  | "tool"
  | "synthesize"
  | "research"
  | "fact_check"
  | "summarize"
  | "document";

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

export type AgentRole =
  | "planner"
  | "router"
  | "toolExecutor"
  | "synthesize"
  | "research"
  | "factCheck"
  | "summarize"
  | "document";

export interface AgentModelMap {
  planner: string | null;
  router: string | null;
  toolExecutor: string | null;
  synthesize: string | null;
  research: string | null;
  factCheck: string | null;
  summarize: string | null;
  document: string | null;
}

export interface LoadProtectionSettings {
  enabled: boolean;
  killPercent: number;
}

export interface AgentSettings {
  enabled: boolean;
  maxParallel: number;
  models: AgentModelMap;
  loadProtection: LoadProtectionSettings;
}
