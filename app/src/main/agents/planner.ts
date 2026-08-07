import { parsePlan } from "./plan";
import type { AgentPlan } from "./types";

const PLAN_PROMPT = (userText: string) => `Create an execution plan for this user request as JSON.

Return only JSON of this shape, with no commentary:
{"steps":[{"id":"1","goal":"...","dependsOn":[],"kind":"tool|memory|retrieve|synthesize"}]}

Rules:
- At most 6 steps.
- Each step needs a unique id and a clear goal.
- dependsOn lists step ids that must finish first (use [] when none).
- kind is optional (defaults to tool).

User request:
${userText}`;

const REPAIR_PROMPT = (userText: string, badOutput: string) => `Your previous response was invalid JSON or did not match the required plan schema.

Fix it and return ONLY valid JSON of this shape:
{"steps":[{"id":"1","goal":"...","dependsOn":[],"kind":"tool|memory|retrieve|synthesize"}]}

Rules:
- At most 6 steps.
- Each step needs a unique id and a clear goal.

User request:
${userText}

Invalid output:
${badOutput}`;

export async function planTurn(opts: {
  model: string;
  userText: string;
  generate: (model: string, prompt: string) => Promise<string>;
}): Promise<AgentPlan | null> {
  const raw1 = await opts.generate(opts.model, PLAN_PROMPT(opts.userText));
  const plan1 = parsePlan(raw1);
  if (plan1) return plan1;

  const raw2 = await opts.generate(opts.model, REPAIR_PROMPT(opts.userText, raw1));
  return parsePlan(raw2);
}
