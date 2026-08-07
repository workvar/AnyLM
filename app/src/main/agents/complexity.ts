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

export function leanComplexity(input: ComplexityInput): ComplexityLean {
  const text = (input.text || "").trim();
  if (!text) return "simple";

  let score = 0;
  if (URL_RE.test(text)) score += 3;
  if (MULTI_STEP_RE.test(text)) score += 3;
  if (CODE_RE.test(text)) score += 2;
  if (FILE_RE.test(text)) score += 1;
  if (input.useTools) score += 1;
  if (input.hasProject) score += 1;
  if (input.hasAttachments) score += 2;
  if (text.length > 400) score += 2;
  if (text.length > 1200) score += 2;

  if (score >= 4) return "complex";
  if (score < 1) return "simple";
  return "ambiguous";
}
