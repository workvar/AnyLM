// General ("cross-app") knowledge base, backed by ChromaDB, scoped per user.
// Optionally mirrors into the organization's shared collection so teammates
// can draw on the same knowledge; reads always merge private + org results.
import * as chroma from "./chroma";
import * as rag from "./rag";

const NAME = chroma.GENERAL;

// docs: [{ text, source }]. Each doc is chunked before storage.
// opts.toOrg additionally writes the chunks to the org's shared collection.
async function add(
  docs: Array<{ text: string; source?: string }>,
  opts: { toOrg?: boolean } = {}
): Promise<number> {
  const items: Array<{ text: string; metadata: Record<string, string> }> = [];
  for (const d of docs || []) {
    for (const t of rag.chunkText(d.text || "")) {
      items.push({ text: t, metadata: { source: d.source || "general" } });
    }
  }
  const n = await chroma.addTexts(NAME, items);
  if (opts.toOrg) await chroma.addTexts(chroma.ORG_SHARED, items).catch(() => {});
  return n;
}

// Top-k chunks for a query, merged across the user's private store and the
// organization's shared store. [{ name, text, score, shared }].
async function search(query: string, topK = 4): Promise<RetrievedChunk[]> {
  const [mine, org] = await Promise.all([
    chroma.queryText(NAME, query, topK),
    chroma.queryText(chroma.ORG_SHARED, query, topK),
  ]);
  const tag = (rows: ChromaRecord[], shared: boolean): RetrievedChunk[] =>
    rows
      .filter((r) => r.score > 0)
      .map((r) => ({
        name: (r.metadata.source || "general") + (shared ? " (org)" : ""),
        text: r.text,
        score: r.score,
        shared,
      }));
  return [...tag(mine, false), ...tag(org, true)]
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

async function count(): Promise<number> {
  return chroma.count(NAME);
}

async function clear(): Promise<boolean> {
  return chroma.clearCollection(NAME);
}

export { add, search, count, clear };

