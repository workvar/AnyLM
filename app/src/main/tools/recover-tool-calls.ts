// Recover tool calls when the model pastes JSON instead of emitting tool_calls.

const MAX_CALLS = 3;

type Recovered = {
  calls: OllamaToolCall[];
  cleanedText: string;
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function coerceArgs(obj: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v == null) continue;
    out[k] = typeof v === "string" ? v : String(v);
  }
  return out;
}

// Known limitation: this can't distinguish "the model is quoting an example"
// from "the model intends to call this" — any well-formed, allow-listed JSON
// object is recovered as a call.
function tryParseTool(obj: unknown, allow: Set<string>): OllamaToolCall | null {
  if (!isPlainObject(obj)) return null;
  const name = obj.name;
  if (typeof name !== "string" || !allow.has(name)) return null;
  const raw = obj.parameters !== undefined ? obj.parameters : obj.arguments;
  if (!isPlainObject(raw)) return null;
  return { function: { name, arguments: coerceArgs(raw) } };
}

// Find JSON object spans by brace matching; also detect ``` / ```json fences.
function recoverToolCalls(text: string, allowedNames: Iterable<string>): Recovered {
  const allow = new Set(allowedNames);
  const src = String(text ?? "");
  const calls: OllamaToolCall[] = [];
  // Collect removable ranges [start, end) in reverse for safe splicing later
  type Range = { start: number; end: number };
  const ranges: Range[] = [];

  const fenceRe = /```(?:json)?\s*\n?([\s\S]*?)```/gi;
  let m: RegExpExecArray | null;
  const fenceSpans: { start: number; end: number; inner: string }[] = [];
  while ((m = fenceRe.exec(src))) {
    fenceSpans.push({
      start: m.index,
      end: m.index + m[0].length,
      inner: m[1],
    });
  }

  function consider(jsonText: string, absStart: number, absEnd: number, fence?: Range) {
    if (calls.length >= MAX_CALLS) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText.trim());
    } catch {
      return;
    }
    const call = tryParseTool(parsed, allow);
    if (!call) return;
    calls.push(call);
    ranges.push(fence ?? { start: absStart, end: absEnd });
  }

  // 1) Fenced blocks that are a single tool JSON object
  for (const f of fenceSpans) {
    if (calls.length >= MAX_CALLS) break;
    consider(f.inner, f.start, f.end, { start: f.start, end: f.end });
  }

  // 2) Bare JSON objects via brace scan (skip ranges already inside kept fences…
  //    simpler: scan whole string; skip if overlapping an already-accepted range)
  let i = 0;
  while (i < src.length && calls.length < MAX_CALLS) {
    if (src[i] !== "{") {
      i++;
      continue;
    }
    let depth = 0;
    let j = i;
    let inStr = false;
    let esc = false;
    for (; j < src.length; j++) {
      const ch = src[j];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === "\\") esc = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') inStr = true;
      else if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          j++;
          break;
        }
      }
    }
    if (depth !== 0) {
      // Unbalanced `{` (e.g. stray brace in prose) — skip past it and keep
      // scanning so a later valid JSON object can still be recovered.
      i++;
      continue;
    }
    const overlaps = ranges.some((r) => i < r.end && j > r.start);
    if (!overlaps) consider(src.slice(i, j), i, j);
    i = Math.max(j, i + 1);
  }

  // Sort ranges and splice from end
  ranges.sort((a, b) => b.start - a.start);
  let cleaned = src;
  for (const r of ranges) {
    cleaned = cleaned.slice(0, r.start) + cleaned.slice(r.end);
  }
  cleaned = cleaned.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

  return { calls, cleanedText: cleaned };
}

export { recoverToolCalls };
