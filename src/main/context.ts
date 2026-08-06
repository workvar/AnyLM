// Project reference context: chunk + store in Chroma, and assemble the
// retrieval-augmented system prompt. Chunk vectors live in Chroma (keyed by
// projectId + contextId); the project JSON keeps only display metadata.
import * as ollama from "./ollama";
import * as chroma from "./chroma";
import * as rag from "./rag";

const MAX_SUMMARY_CHARS = 8000;
const TOP_K = 4;
const NAME = chroma.PROJECT_CONTEXT;

// Ingest a reference: chunk it, store chunks in Chroma under {projectId,
// contextId, name}, and make a short display summary.
// Returns { summary, chunkCount, embedded }.
async function ingest({ projectId, contextId, model, name, content }) {
  const text = content || "";
  const chunks = rag.chunkText(text);
  let stored = 0;
  if (chunks.length) {
    stored = await chroma.addTexts(
      NAME,
      chunks.map((t) => ({ text: t, metadata: { projectId, contextId, name } }))
    );
  }
  const summary = await makeSummary(model, name, text);
  return { summary, chunkCount: chunks.length, embedded: chunks.length > 0 && stored === chunks.length };
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

// Remove a reference's chunks from Chroma.
async function removeContext(projectId, contextId) {
  return chroma.remove(NAME, { $and: [{ projectId }, { contextId }] });
}

// Remove all of a project's reference chunks (on project delete).
async function removeProject(projectId) {
  return chroma.remove(NAME, { projectId });
}

// Retrieve the top-k chunks across a project's references for a query.
// Returns [{ name, text, score }]. Empty when retrieval is unavailable.
async function retrieve(project, query) {
  const res = await chroma.queryText(NAME, query, TOP_K, { projectId: project.id });
  return res
    .filter((r) => r.score > 0)
    .map((r) => ({ name: r.metadata.name || "reference", text: r.text, score: r.score }));
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

// Fallback when retrieval returns nothing: use stored summaries.
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

export { ingest, removeContext, removeProject, retrieve, buildSystemPrompt, buildSummaryPrompt };

