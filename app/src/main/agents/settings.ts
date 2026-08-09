import * as appSettings from "../settings";
import { clampKillPercent } from "../load-guard/clamp";
import { clampMaxParallel } from "./max-parallel";
import type { AgentSettings, AgentStepKind } from "./types";

export function resolveAgentSettings(s?: AppSettings): AgentSettings {
  const agents = (s || appSettings.read()).agents;
  return {
    enabled: agents?.enabled !== false,
    maxParallel: clampMaxParallel(agents?.maxParallel),
    models: {
      planner: agents?.models?.planner ?? null,
      router: agents?.models?.router ?? null,
      toolExecutor: agents?.models?.toolExecutor ?? null,
      synthesize: agents?.models?.synthesize ?? null,
      research: agents?.models?.research ?? null,
      factCheck: agents?.models?.factCheck ?? null,
      summarize: agents?.models?.summarize ?? null,
      document: agents?.models?.document ?? null,
    },
    loadProtection: {
      enabled: agents?.loadProtection?.enabled !== false,
      killPercent: clampKillPercent(agents?.loadProtection?.killPercent),
    },
  };
}

export function modelForRole(
  agents: AgentSettings,
  role: keyof AgentSettings["models"],
  chatModel: string
): string {
  return agents.models[role] || chatModel;
}

export function modelForStepKind(
  agents: AgentSettings,
  kind: AgentStepKind,
  chatModel: string
): string {
  if (kind === "research") {
    return agents.models.research || agents.models.toolExecutor || chatModel;
  }
  if (kind === "document") {
    return agents.models.document || agents.models.toolExecutor || chatModel;
  }
  if (kind === "fact_check") {
    return agents.models.factCheck || chatModel;
  }
  if (kind === "summarize") {
    return agents.models.summarize || chatModel;
  }
  if (kind === "tool") {
    return agents.models.toolExecutor || chatModel;
  }
  return chatModel;
}
