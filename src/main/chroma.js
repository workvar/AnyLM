// ChromaDB-backed vector store — the single context/memory backend.
//
// Chroma runs as a local server (like Ollama); we connect over HTTP. Embeddings
// are computed by the local Ollama embed model and passed in precomputed, so
// Chroma is used purely for storage + cosine similarity search. Every call
// fails soft: if the server is unreachable, reads return [] and writes are
// dropped, so the app keeps working without Chroma running.
const ollama = require("./ollama");
const { EMBED_MODEL } = require("./embed");
const settings = require("./settings");
const identity = require("./identity");

let ChromaClient = null;
try {
  ({ ChromaClient } = require("chromadb"));
} catch {
  ChromaClient = null; // dependency missing; stay soft.
}

// Logical collection names. Each is scoped per signed-in user at runtime, so
// every account keeps a private knowledge base on the same Chroma server.
const GENERAL = "anylm_general";
const PROJECT_CONTEXT = "anylm_project_context";
const PROJECT_MEMORY = "anylm_project_memory";
// Sentinel for the organization's shared knowledge base (one per org).
const ORG_SHARED = "@org_shared";

// Chroma collection names allow [a-zA-Z0-9._-], 3-63 chars.
function slug(v) {
  return String(v || "").replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 30);
}

// Resolve a logical name to the physical, identity-scoped collection.
// Returns null for ORG_SHARED when the user has no organization.
function resolveName(name) {
  const who = identity.get();
  if (name === ORG_SHARED) {
    return who.orgId ? `anylm_org_${slug(who.orgId)}` : null;
  }
  return who.userId ? `${name}_u_${slug(who.userId)}` : name;
}

let client = null;
const remoteClients = new Map(); // url -> ChromaClient (org remote endpoints)
const collections = new Map(); // cacheKey -> Collection handle

function getClient() {
  if (client) return client;
  if (!ChromaClient) return null;
  const s = settings.read();
  try {
    client = new ChromaClient({
      host: s.chromaHost || "localhost",
      port: s.chromaPort || 8000,
      ssl: !!s.chromaSsl,
    });
  } catch {
    client = null;
  }
  return client;
}

// "https://chroma.acme.com:9000" -> { host, port, ssl } (null when invalid).
function parseChromaUrl(url) {
  try {
    const u = new URL(url);
    const ssl = u.protocol === "https:";
    return { host: u.hostname, port: Number(u.port) || (ssl ? 443 : 8000), ssl };
  } catch {
    return null;
  }
}

// The org's shared collection can live on a remote Chroma server, set by org
// admins, so every member syncs to one central memory. Everything else stays
// on the local server.
function clientFor(logicalName) {
  if (logicalName === ORG_SHARED) {
    const url = identity.get().orgChromaUrl;
    if (url) {
      if (remoteClients.has(url)) return remoteClients.get(url);
      const cfg = parseChromaUrl(url);
      if (!cfg || !ChromaClient) return null;
      try {
        const c = new ChromaClient(cfg);
        remoteClients.set(url, c);
        return c;
      } catch {
        return null;
      }
    }
  }
  return getClient();
}

async function getCollection(logicalName) {
  const name = resolveName(logicalName);
  if (!name) return null; // e.g. ORG_SHARED without an org
  const endpoint = (logicalName === ORG_SHARED && identity.get().orgChromaUrl) || "local";
  const cacheKey = `${name}@${endpoint}`;
  if (collections.has(cacheKey)) return collections.get(cacheKey);
  const c = clientFor(logicalName);
  if (!c) return null;
  try {
    const col = await c.getOrCreateCollection({
      name,
      embeddingFunction: null, // we always pass precomputed embeddings
      configuration: { hnsw: { space: "cosine" } },
    });
    collections.set(cacheKey, col);
    return col;
  } catch (e) {
    console.warn(`[chroma] getOrCreateCollection(${name}) failed: ${e.message}`);
    return null;
  }
}

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

async function embed(texts) {
  if (!texts.length) return [];
  return ollama.embed(EMBED_MODEL, texts);
}

// docs: [{ id?, text, metadata? }]. Embeds via Ollama then adds to Chroma.
// Returns the number of records stored.
async function addTexts(name, docs) {
  const list = (docs || []).filter((d) => d && d.text && d.text.trim());
  if (!list.length) return 0;
  const col = await getCollection(name);
  if (!col) return 0;
  let vectors;
  try {
    vectors = await embed(list.map((d) => d.text));
  } catch (e) {
    console.warn(`[chroma] embed failed for "${name}": ${e.message}`);
    return 0;
  }
  if (vectors.length !== list.length) return 0;
  try {
    await col.add({
      ids: list.map((d) => d.id || newId()),
      embeddings: vectors,
      documents: list.map((d) => d.text),
      metadatas: list.map((d) => d.metadata || {}),
    });
    return list.length;
  } catch (e) {
    console.warn(`[chroma] add to "${name}" failed: ${e.message}`);
    return 0;
  }
}

// Query by text. Returns [{ text, metadata, score }] best-first (cosine sim).
async function queryText(name, query, topK = 4, where = undefined) {
  if (!query || !query.trim()) return [];
  const col = await getCollection(name);
  if (!col) return [];
  let qVec;
  try {
    [qVec] = await embed([query]);
  } catch {
    return [];
  }
  if (!qVec) return [];
  try {
    const res = await col.query({
      queryEmbeddings: [qVec],
      nResults: topK,
      where,
      include: ["documents", "metadatas", "distances"],
    });
    const docs = (res.documents && res.documents[0]) || [];
    const metas = (res.metadatas && res.metadatas[0]) || [];
    const dists = (res.distances && res.distances[0]) || [];
    return docs
      .map((text, i) => ({
        text,
        metadata: metas[i] || {},
        // cosine distance in [0,2] -> similarity in [-1,1]
        score: dists[i] == null ? 0 : 1 - dists[i],
      }))
      .filter((r) => r.text);
  } catch (e) {
    console.warn(`[chroma] query "${name}" failed: ${e.message}`);
    return [];
  }
}

// Delete records matching a metadata filter.
async function remove(name, where) {
  if (!where) return false;
  const col = await getCollection(name);
  if (!col) return false;
  try {
    await col.delete({ where });
    return true;
  } catch (e) {
    console.warn(`[chroma] delete from "${name}" failed: ${e.message}`);
    return false;
  }
}

// Drop an entire collection (used for "clear knowledge").
async function clearCollection(logicalName) {
  const name = resolveName(logicalName);
  if (!name) return false;
  const c = clientFor(logicalName);
  if (!c) return false;
  try {
    await c.deleteCollection({ name });
    for (const key of [...collections.keys()]) {
      if (key.startsWith(`${name}@`)) collections.delete(key);
    }
    return true;
  } catch (e) {
    console.warn(`[chroma] clear "${name}" failed: ${e.message}`);
    return false;
  }
}

// Count records, optionally matching a filter.
async function count(name, where) {
  const col = await getCollection(name);
  if (!col) return 0;
  try {
    if (!where) return await col.count();
    const got = await col.get({ where, include: [] });
    return (got.ids || []).length;
  } catch {
    return 0;
  }
}

// Is the Chroma server reachable?
async function available() {
  const c = getClient();
  if (!c) return false;
  try {
    await c.heartbeat();
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  GENERAL,
  PROJECT_CONTEXT,
  PROJECT_MEMORY,
  ORG_SHARED,
  addTexts,
  queryText,
  remove,
  clearCollection,
  count,
  available,
  newId,
};
