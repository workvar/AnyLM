import * as appSettings from "../settings";
import { clampMaxParallel } from "./max-parallel";
import type { AgentSettings } from "./types";

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
