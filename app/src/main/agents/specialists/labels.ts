const LABELS: Record<string, string> = {
  research: "Research",
  fact_check: "Fact check",
  summarize: "Summarize",
  document: "Document",
};

export function labelForStepKind(kind: string): string {
  return LABELS[kind] || kind;
}
