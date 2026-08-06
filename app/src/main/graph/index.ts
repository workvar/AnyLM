// Project knowledge graph: the structured half of shared project memory.
//
// Chroma recalls passages that read like the question. The graph answers the
// other kind of question — who works on what, which file belongs to which
// decision — and it holds across every chat in the project, not just the one
// the fact was mentioned in.
import * as graphStore from "./store";
import { extract } from "./extract";

const MAX_LINES = 12;
const MAX_KEY_ENTITIES = 6;

// Learn from one completed exchange. Fire-and-forget from the chat loop.
async function remember({
  projectId,
  threadId,
  model,
  userText,
  assistantText,
}: {
  projectId: string;
  threadId?: string | null;
  model: string;
  userText: string;
  assistantText: string;
}): Promise<number> {
  if (!projectId) return 0;
  const { entities, relations } = await extract(model, userText, assistantText);
  if (!entities.length) return 0;
  graphStore.upsert(projectId, threadId || null, entities, relations);
  return entities.length;
}

function words(text: string): string[] {
  return String(text || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2);
}

// Nodes the query mentions, most-referenced first.
function matchNodes(projectId: string, query: string): graphStore.GraphNode[] {
  const q = String(query || "").toLowerCase();
  const qWords = new Set(words(q));
  return graphStore
    .nodesOf(projectId)
    .filter((n) => {
      const name = n.name.toLowerCase();
      if (name.length > 3 && q.includes(name)) return true;
      return words(name).some((w) => qWords.has(w));
    })
    .sort((a, b) => b.mentions - a.mentions);
}

// A system-prompt block of facts related to the query, or "" when the graph
// has nothing to say. Shared across every thread in the project.
function recall({ projectId, query }: { projectId: string; query: string }): string {
  if (!projectId || !query || !query.trim()) return "";
  const names = graphStore.nameById(projectId);
  const edges = graphStore.edgesOf(projectId);
  if (!edges.length) return "";

  const hits = matchNodes(projectId, query);
  const ids = new Set(hits.slice(0, 8).map((n) => n.id));

  let related = edges.filter((e) => ids.has(e.from) || ids.has(e.to));
  if (!related.length) {
    // Nothing matched: fall back to the project's most-connected facts so the
    // model still knows the cast of characters.
    const top = new Set(
      graphStore
        .nodesOf(projectId)
        .sort((a, b) => b.mentions - a.mentions)
        .slice(0, MAX_KEY_ENTITIES)
        .map((n) => n.id)
    );
    related = edges.filter((e) => top.has(e.from) && top.has(e.to));
  }
  if (!related.length) return "";

  const lines = related
    .sort((a, b) => b.lastSeen.localeCompare(a.lastSeen))
    .slice(0, MAX_LINES)
    .map((e) => `- ${names.get(e.from)} ${e.rel.replace(/_/g, " ")} ${names.get(e.to)}`);

  return (
    "Known facts from this project's knowledge graph (built from every chat in " +
    "the project — treat as established unless the user corrects them):\n\n" +
    lines.join("\n")
  );
}

// Everything the graph knows about a project, for the Context panel.
function summary(projectId: string): { entities: number; relations: number; top: string[] } {
  const nodes = graphStore.nodesOf(projectId);
  return {
    entities: nodes.length,
    relations: graphStore.edgesOf(projectId).length,
    top: nodes
      .sort((a, b) => b.mentions - a.mentions)
      .slice(0, MAX_KEY_ENTITIES)
      .map((n) => n.name),
  };
}

function forget(projectId: string): boolean {
  if (!projectId) return false;
  graphStore.forget(projectId);
  return true;
}

export { remember, recall, summary, forget };
