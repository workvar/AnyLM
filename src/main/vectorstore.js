// On-device "general" knowledge base. Chunks + embeddings persisted locally in
// userData (no server). Populated from standalone chats and from projects that
// opt to export; read by chats and by projects that opt to import.
const { app } = require("electron");
const fs = require("fs");
const path = require("path");
const ollama = require("./ollama");
const rag = require("./rag");

const EMBED_MODEL = process.env.LLMETER_EMBED_MODEL || "nomic-embed-text";

function filePath() {
  return path.join(app.getPath("userData"), "llmeter-knowledge.json");
}

function readAll() {
  try {
    return JSON.parse(fs.readFileSync(filePath(), "utf8"));
  } catch {
    return [];
  }
}

function writeAll(items) {
  fs.writeFileSync(filePath(), JSON.stringify(items, null, 2));
}

function id() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// Chunk + embed text blobs and append. docs: [{ text, source }].
async function add(docs) {
  const items = readAll();
  let added = 0;
  for (const d of docs) {
    const chunks = rag.chunkText(d.text || "");
    if (!chunks.length) continue;
    let vectors = [];
    try {
      vectors = await ollama.embed(EMBED_MODEL, chunks);
    } catch {
      vectors = [];
    }
    if (vectors.length !== chunks.length) continue; // embedding unavailable
    chunks.forEach((t, i) => {
      items.push({
        id: id(),
        source: d.source || "general",
        text: t,
        vector: vectors[i],
        createdAt: new Date().toISOString(),
      });
      added++;
    });
  }
  if (added) writeAll(items);
  return added;
}

// Top-k general chunks for a query string. [{ name, text, score }].
async function search(query, topK = 4) {
  const items = readAll();
  if (!items.length || !query || !query.trim()) return [];
  let qVec;
  try {
    [qVec] = await ollama.embed(EMBED_MODEL, [query]);
  } catch {
    return [];
  }
  if (!qVec) return [];
  return rag
    .topK(qVec, items, topK)
    .filter((r) => r.score > 0)
    .map((r) => ({ name: r.source, text: r.text, score: r.score }));
}

function count() {
  return readAll().length;
}

function clear() {
  writeAll([]);
}

module.exports = { add, search, count, clear };
