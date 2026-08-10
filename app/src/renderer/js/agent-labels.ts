// Keep in sync with app/src/main/agents/specialists/labels.ts (no cross-root import).
export function stepKindLabel(kind: string): string {
  if (kind === "research") return "Research";
  if (kind === "fact_check") return "Fact check";
  if (kind === "summarize") return "Summarize";
  if (kind === "document") return "Document";
  return kind;
}
