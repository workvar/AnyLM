import { parsePlan } from "./plan";
import type { AgentPlan } from "./types";

const KIND_UNION =
  "tool|memory|retrieve|synthesize|research|fact_check|summarize|document";

const KNOWLEDGE_BIAS = `
Prefer Knowledge step kinds when they fit: research (web/docs lookup), fact_check (verify claims), summarize (compress findings), document (generate_document). Prefer research before answering factual current-events questions.`;

const PLAN_PROMPT = (userText: string, preferentialKnowledge?: boolean) => {
  let prompt = `Create an execution plan for this user request as JSON.

Return only JSON of this shape, with no commentary:
{"steps":[{"id":"1","goal":"...","dependsOn":[],"kind":"${KIND_UNION}"}]}

Rules:
- At most 6 steps.
- Each step needs a unique id and a clear goal.
- dependsOn lists step ids that must finish first (use [] when none).
- kind is optional (defaults to tool).`;

  if (preferentialKnowledge) {
    prompt += KNOWLEDGE_BIAS;
  }

  prompt += `

User request:
${userText}`;

  return prompt;
};

const REPAIR_PROMPT = (userText: string, badOutput: string, preferentialKnowledge?: boolean) => {
  let prompt = `Your previous response was invalid JSON or did not match the required plan schema.

Fix it and return ONLY valid JSON of this shape:
{"steps":[{"id":"1","goal":"...","dependsOn":[],"kind":"${KIND_UNION}"}]}

Rules:
- At most 6 steps.
- Each step needs a unique id and a clear goal.`;

  if (preferentialKnowledge) {
    prompt += KNOWLEDGE_BIAS;
  }

  prompt += `

User request:
${userText}

Invalid output:
${badOutput}`;

  return prompt;
};

export async function planTurn(opts: {
  model: string;
  userText: string;
  preferentialKnowledge?: boolean;
  generate: (model: string, prompt: string) => Promise<string>;
}): Promise<AgentPlan | null> {
  const raw1 = await opts.generate(opts.model, PLAN_PROMPT(opts.userText, opts.preferentialKnowledge));
  const plan1 = parsePlan(raw1);
  if (plan1) return plan1;

  const raw2 = await opts.generate(
    opts.model,
    REPAIR_PROMPT(opts.userText, raw1, opts.preferentialKnowledge)
  );
  return parsePlan(raw2);
}
