export type Cell = "yes" | "partial" | "no";

export interface ComparisonRow {
  axis: string;
  anylm: Cell;
  ollama: Cell;
  lmStudio: Cell;
  jan: Cell;
  gpt4all: Cell;
}

export const COMPARISON_COLUMNS = [
  { key: "anylm", label: "AnyLM" },
  { key: "ollama", label: "Ollama" },
  { key: "lmStudio", label: "LM Studio" },
  { key: "jan", label: "Jan" },
  { key: "gpt4all", label: "GPT4All" },
] as const;

export const COMPARISON_ROWS: ComparisonRow[] = [
  {
    axis: "Desktop app",
    anylm: "yes",
    ollama: "partial",
    lmStudio: "yes",
    jan: "yes",
    gpt4all: "yes",
  },
  {
    axis: "OpenAI-compatible API",
    anylm: "yes",
    ollama: "yes",
    lmStudio: "yes",
    jan: "partial",
    gpt4all: "partial",
  },
  {
    axis: "Model pooling / shared resident runtime",
    anylm: "yes",
    ollama: "partial",
    lmStudio: "partial",
    jan: "no",
    gpt4all: "no",
  },
  {
    axis: "Projects + local RAG",
    anylm: "yes",
    ollama: "no",
    lmStudio: "partial",
    jan: "partial",
    gpt4all: "partial",
  },
  {
    axis: "Org governance / usage",
    anylm: "yes",
    ollama: "no",
    lmStudio: "no",
    jan: "no",
    gpt4all: "no",
  },
  {
    axis: "Background always-on router",
    anylm: "yes",
    ollama: "yes",
    lmStudio: "partial",
    jan: "partial",
    gpt4all: "no",
  },
  {
    axis: "Works with models already installed",
    anylm: "yes",
    ollama: "yes",
    lmStudio: "yes",
    jan: "yes",
    gpt4all: "yes",
  },
  {
    axis: "Multi-agent orchestration",
    anylm: "yes",
    ollama: "no",
    lmStudio: "no",
    jan: "no",
    gpt4all: "no",
  },
  {
    axis: "Project-first coding / file writes",
    anylm: "yes",
    ollama: "no",
    lmStudio: "partial",
    jan: "partial",
    gpt4all: "no",
  },
  {
    axis: "Load protection (RAM soft-stop)",
    anylm: "yes",
    ollama: "no",
    lmStudio: "no",
    jan: "no",
    gpt4all: "no",
  },
];
