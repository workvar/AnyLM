// Context ingestion (chunk + embed) and retrieval-augmented prompt assembly.
const ollama = require("./ollama");
const rag = require("./rag");

const EMBED_MODEL = process.env.LLMETER_EMBED_MODEL || "nomic-embed-text";
const MAX_SUMMARY_CHARS = 8000;
const TOP_K = 4;

// Ingest a reference: chunk it, embed each chunk, and make a short display summary.
// Returns { summary, chunks: [{ text, vector }], embedded: bool }.
async function ingest(summarizeModel, name, content) {
  const text = content || "";
  const chunks = rag.chunkText(text);
  let embedded = false;
  let vectors = [];
  try {
    if (chunks.length) {
      vectors = await ollama.embed(EMBED_MODEL, chunks);
      embedded = vectors.length === chunks.length;
    }
  } catch {
    embedded = false;
  }
  const stored = chunks.map((t, i) => ({
    text: t,
    vector: embedded ? vectors[i] : null,
  }));
  const summary = await makeSummary(summarizeModel, name, text);
  return { summary, chunks: stored, embedded };
}

async function makeSummary(model, name, content) {
  const trimmed = (content || "").slice(0, MAX_SUMMARY_CHARS);
  if (!model || !trimmed.trim()) return trimmed.slice(0, 300);
  const prompt =
    `Summarize the document titled "${name}" in 2-3 sentences for a reference index. ` +
    `Reply with the summary only.\n\n---\n${trimmed}`;
  try {
    const out = await ollama.generate(model, prompt);
    return out.trim() || trimmed.slice(0, 300);
  } catch {
    return trimmed.slice(0, 300);
  }
}

// Retrieve the top-k chunks across a project's references for a query.
// Returns [{ name, text, score }]. Empty array if retrieval is unavailable.
async function retrieve(project, query) {
  const pool = [];
  for (const c of project.contexts || []) {
    for (const ch of c.chunks || []) {
      if (Array.isArray(ch.vector)) pool.push({ name: c.name, text: ch.text, vector: ch.vector });
    }
  }
  if (!pool.length || !query.trim()) return [];
  try {
    const [qVec] = await ollama.embed(EMBED_MODEL, [query]);
    if (!qVec) return [];
    return rag.topK(qVec, pool, TOP_K).filter((r) => r.score > 0);
  } catch {
    return [];
  }
}

// System prompt from instructions plus retrieved passages.
function buildSystemPrompt(project, retrieved) {
  const parts = [];
  if (project.instructions && project.instructions.trim()) {
    parts.push(`Project instructions:\n${project.instructions.trim()}`);
  }
  if (retrieved && retrieved.length) {
    const blocks = retrieved
      .map((r, i) => `[${i + 1}] from "${r.name}"\n${r.text}`)
      .join("\n\n");
    parts.push(
      `Relevant excerpts from the project's reference material. Use them when answering ` +
        `and cite the source name when you rely on one.\n\n${blocks}`
    );
  }
  return parts.join("\n\n---\n\n");
}

// Fallback when no embeddings exist: use stored summaries instead of retrieval.
function buildSummaryPrompt(project) {
  const parts = [];
  if (project.instructions && project.instructions.trim()) {
    parts.push(`Project instructions:\n${project.instructions.trim()}`);
  }
  const ctxs = project.contexts || [];
  if (ctxs.length) {
    const blocks = ctxs.map((c, i) => `[${i + 1}] ${c.name}\n${c.summary || ""}`).join("\n\n");
    parts.push(`Project reference summaries (use when relevant):\n\n${blocks}`);
  }
  return parts.join("\n\n---\n\n");
}

module.exports = { ingest, retrieve, buildSystemPrompt, buildSummaryPrompt, EMBED_MODEL };
