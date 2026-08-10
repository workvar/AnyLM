export type KnowledgeKind = "research" | "fact_check" | "summarize" | "document";

export function allowlistFor(kind: KnowledgeKind): string[] | null {
  if (kind === "research") return ["web_search", "http_fetch"];
  if (kind === "fact_check") return ["http_fetch"];
  if (kind === "summarize") return [];
  if (kind === "document")
    return ["generate_document", "web_search", "http_fetch", "read_file"];
  return null;
}

export function filterToolDefs(
  defs: OllamaToolDef[] | null,
  allow: string[] | null
): OllamaToolDef[] | null {
  if (!defs) return null;
  if (allow === null) return defs;
  if (allow.length === 0) return null;
  const set = new Set(allow);
  const filtered = defs.filter((d) => set.has(d.function.name));
  return filtered.length ? filtered : null;
}
