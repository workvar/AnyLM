function stripMarkdownFences(raw: string): string {
  const trimmed = raw.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/);
  return fenceMatch ? fenceMatch[1].trim() : trimmed;
}

export function parseClassify(text: string): "single" | "multi" | null {
  const trimmed = stripMarkdownFences(text);
  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed === "object" && parsed !== null) {
      const mode = (parsed as { mode?: unknown }).mode;
      if (mode === "single" || mode === "multi") return mode;
    }
  } catch {
    // not JSON — fall through to word-boundary match
  }
  if (/\bmulti\b/i.test(trimmed)) return "multi";
  if (/\bsingle\b/i.test(trimmed)) return "single";
  return null;
}

const CLASSIFY_PROMPT = (text: string) => `Decide whether this user request needs multi-agent orchestration (parallel research, retrieval, and tool steps) or can be handled by a single agent.

Return only JSON with no commentary:
{"mode":"single" or "multi"}

User request:
${text}`;

export async function classifyComplexity(opts: {
  model: string;
  text: string;
  preferMulti: boolean;
  generate: (model: string, prompt: string) => Promise<string>;
}): Promise<"single" | "multi"> {
  const fallback = opts.preferMulti ? "multi" : "single";
  try {
    const raw = await opts.generate(opts.model, CLASSIFY_PROMPT(opts.text));
    return parseClassify(raw) ?? fallback;
  } catch {
    return fallback;
  }
}
