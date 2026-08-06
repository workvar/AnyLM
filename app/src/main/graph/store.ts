// Persistence for the per-project knowledge graph.
//
// One JSON file in userData holds every project's nodes and edges. It stays
// small by design: entities are deduplicated by name, and each edge is a
// single triple. Chroma keeps the prose; this keeps the structure.
import { app } from "electron";
import * as fs from "fs";
import * as path from "path";

const MAX_EDGES_PER_PROJECT = 2000;

interface GraphNode {
  id: string;
  projectId: string;
  type: string;
  name: string;
  mentions: number;
  lastSeen: string;
}

interface GraphEdge {
  projectId: string;
  from: string;
  to: string;
  rel: string;
  threadId: string;
  lastSeen: string;
}

interface GraphFile {
  nodes: Record<string, GraphNode>;
  edges: GraphEdge[];
}

function filePath(): string {
  return path.join(app.getPath("userData"), "anylm-graph.json");
}

function read(): GraphFile {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath(), "utf8"));
    return { nodes: parsed.nodes || {}, edges: parsed.edges || [] };
  } catch {
    return { nodes: {}, edges: [] };
  }
}

function write(graph: GraphFile): void {
  try {
    fs.writeFileSync(filePath(), JSON.stringify(graph));
  } catch (e) {
    console.warn(`[graph] write failed: ${(e as Error).message}`);
  }
}

function key(projectId: string, name: string): string {
  return `${projectId}::${String(name).trim().toLowerCase().slice(0, 60)}`;
}

// Merge one extraction into the graph. Entities are {name, type};
// relations are {from, rel, to} using entity names.
function upsert(
  projectId: string,
  threadId: string | null,
  entities: Array<{ name: string; type?: string }>,
  relations: Array<{ from: string; rel: string; to: string }>
): void {
  const graph = read();
  const now = new Date().toISOString();

  for (const e of entities) {
    const name = String(e.name || "").trim();
    if (!name) continue;
    const id = key(projectId, name);
    const existing = graph.nodes[id];
    graph.nodes[id] = {
      id,
      projectId,
      type: String(e.type || existing?.type || "thing").toLowerCase().slice(0, 24),
      name: existing?.name || name.slice(0, 80),
      mentions: (existing?.mentions || 0) + 1,
      lastSeen: now,
    };
  }

  for (const r of relations) {
    const from = key(projectId, r.from || "");
    const to = key(projectId, r.to || "");
    const rel = String(r.rel || "").trim().slice(0, 40);
    if (!rel || !graph.nodes[from] || !graph.nodes[to] || from === to) continue;
    const match = graph.edges.find(
      (x) => x.projectId === projectId && x.from === from && x.to === to && x.rel === rel
    );
    if (match) match.lastSeen = now;
    else graph.edges.push({ projectId, from, to, rel, threadId: threadId || "", lastSeen: now });
  }

  // Trim the oldest edges if one project grows unbounded.
  const mine = graph.edges.filter((e) => e.projectId === projectId);
  if (mine.length > MAX_EDGES_PER_PROJECT) {
    const keep = new Set(
      mine
        .sort((a, b) => b.lastSeen.localeCompare(a.lastSeen))
        .slice(0, MAX_EDGES_PER_PROJECT)
    );
    graph.edges = graph.edges.filter((e) => e.projectId !== projectId || keep.has(e));
  }
  write(graph);
}

function nodesOf(projectId: string): GraphNode[] {
  return Object.values(read().nodes).filter((n) => n.projectId === projectId);
}

function edgesOf(projectId: string): GraphEdge[] {
  return read().edges.filter((e) => e.projectId === projectId);
}

function nameById(projectId: string): Map<string, string> {
  return new Map(nodesOf(projectId).map((n) => [n.id, n.name]));
}

function forget(projectId: string): void {
  const graph = read();
  for (const id of Object.keys(graph.nodes)) {
    if (graph.nodes[id].projectId === projectId) delete graph.nodes[id];
  }
  graph.edges = graph.edges.filter((e) => e.projectId !== projectId);
  write(graph);
}

export { upsert, nodesOf, edgesOf, nameById, forget };
export type { GraphNode, GraphEdge };
