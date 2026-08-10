export const DOCUMENT_GENERATE_NUDGE =
  "You already ran research tools. Prefer calling generate_document now with full markdown. Only search/fetch again if a critical fact is still missing.";

export const RESEARCH_TOOLS = new Set(["web_search", "http_fetch"]);

export interface DocNudgeState {
  documentIntent: boolean;
  researchOnlyRounds: number;
  attemptedGenerate: boolean;
  nudged: boolean;
}

export function isResearchOnlyRound(toolNames: string[]): boolean {
  if (!toolNames.length) return false;
  return toolNames.every((n) => RESEARCH_TOOLS.has(n));
}

export function shouldNudgeDocumentGenerate(state: DocNudgeState): boolean {
  return (
    state.documentIntent &&
    !state.nudged &&
    !state.attemptedGenerate &&
    state.researchOnlyRounds >= 2
  );
}

export function recordToolRound(state: DocNudgeState, toolNames: string[]): DocNudgeState {
  const names = toolNames.filter(Boolean);
  const attemptedGenerate = state.attemptedGenerate || names.includes("generate_document");
  const researchOnlyRounds =
    isResearchOnlyRound(names) ? state.researchOnlyRounds + 1 : state.researchOnlyRounds;
  return { ...state, attemptedGenerate, researchOnlyRounds };
}
