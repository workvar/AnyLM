// General ("cross-app") knowledge base, backed by ChromaDB.
// Populated from standalone chats and from projects that opt to export; read by
// chats and by projects that opt to import. Text is chunked here, then stored
// and searched in Chroma (see chroma.js). Keeps the original interface so
// callers (ipc.js) are unchanged.
const chroma = require("./chroma");
const rag = require("./rag");

const NAME = chroma.GENERAL;

// docs: [{ text, source }]. Each doc is chunked before storage.
async function add(docs) {
  const items = [];
  for (const d of docs || []) {
    for (const t of rag.chunkText(d.text || "")) {
      items.push({ text: t, metadata: { source: d.source || "general" } });
    }
  }
  return chroma.addTexts(NAME, items);
}

// Top-k general chunks for a query. [{ name, text, score }].
async function search(query, topK = 4) {
  const res = await chroma.queryText(NAME, query, topK);
  return res
    .filter((r) => r.score > 0)
    .map((r) => ({ name: r.metadata.source || "general", text: r.text, score: r.score }));
}

async function count() {
  return chroma.count(NAME);
}

async function clear() {
  return chroma.clearCollection(NAME);
}

module.exports = { add, search, count, clear };
