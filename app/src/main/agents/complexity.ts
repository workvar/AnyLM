export type ComplexityLean = "simple" | "complex" | "ambiguous";

export interface ComplexityInput {
  text: string;
  useTools: boolean;
  hasProject: boolean;
  hasAttachments: boolean;
}

const URL_RE = /https?:\/\/\S+/i;
const MULTI_STEP_RE =
  /\b(first|then|after that|multi-?step|step by step|and then|finally)\b/i;
const CODE_RE = /\b(code|refactor|debug|stack trace|pull request|unit test)\b/i;
const FILE_RE = /\b(file|folder|directory|pdf|docx|csv)\b/i;

const RESEARCH_RE =
  /\b(research|look up|find sources|what does the web say|investigate)\b/i;
const FACT_CHECK_RE = /\b(verify|fact[- ]?check|is this true|cross[- ]?check)\b/i;
const SUMMARIZE_RE = /\b(summarize|tl;?dr|brief me on|condense)\b/i;
const DOCUMENT_RE =
  /\b(write|generate|draft)\b.*\b(pdf|docx|report|brief|memo|document)\b|\b(pdf|docx)\b.*\b(brief|report)\b/i;

export function isPreferentialKnowledge(text: string): boolean {
  const t = (text || "").trim();
  if (!t) return false;
  return (
    RESEARCH_RE.test(t) ||
    FACT_CHECK_RE.test(t) ||
    SUMMARIZE_RE.test(t) ||
    DOCUMENT_RE.test(t)
  );
}

export function leanComplexity(input: ComplexityInput): ComplexityLean {
  if (isPreferentialKnowledge(input.text)) return "complex";

  const text = (input.text || "").trim();
  if (!text) return "simple";

  // Signals derived from what's actually being asked. These alone gate
  // whether a turn can stay "simple" — a project/tools flag on a trivial
  // question must not, by itself, force the extra classify() round trip.
  let contentScore = 0;
  if (URL_RE.test(text)) contentScore += 3;
  if (MULTI_STEP_RE.test(text)) contentScore += 3;
  if (CODE_RE.test(text)) contentScore += 2;
  if (FILE_RE.test(text)) contentScore += 1;
  if (input.hasAttachments) contentScore += 2;
  if (text.length > 400) contentScore += 2;
  if (text.length > 1200) contentScore += 2;

  // Context flags nudge an already-nontrivial turn toward "complex" (skip
  // the classify() call entirely), but must not turn a trivial question
  // "ambiguous" on their own.
  let contextScore = 0;
  if (input.useTools) contextScore += 1;
  if (input.hasProject) contextScore += 1;

  if (contentScore + contextScore >= 4) return "complex";
  if (contentScore < 1) return "simple";
  return "ambiguous";
}
