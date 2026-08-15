// Cross-thread project memory, backed by ChromaDB. Chats inside one project
// share what the user tells the model (name, preferences, decisions): each
// completed exchange is embedded and stored, and relevant memories from the
// project's OTHER threads are retrieved into the system prompt.
import * as chroma from "./chroma";

const TOP_K = 4;
// Cosine similarity below this is treated as "unrelated". Chroma returns the
// nearest records regardless of how far away they are, so an unfiltered recall
// pastes the previous thread's task into a brand-new one and small local
// models act on it (asked for a deck on X, they research last week's Y).
const MIN_SCORE = 0.45;
const NAME = chroma.PROJECT_MEMORY;

// Store one exchange (user + assistant) as a memory record for the project.
async function remember({
  projectId,
  threadId,
  userText,
  assistantText,
}: {
  projectId: string;
  threadId?: string | null;
  userText: string;
  assistantText: string;
}): Promise<number> {
  if (!projectId) return 0;
  const text = [userText && `User: ${userText}`, assistantText && `Assistant: ${assistantText}`]
    .filter(Boolean)
    .join("\n");
  if (!text.trim()) return 0;
  return chroma.addTexts(NAME, [
    { text, metadata: { projectId, threadId: threadId || "" } },
  ]);
}

// Retrieve relevant memory from the project's other threads for a query.
// Returns a system-prompt block, or "" when there's nothing useful.
async function recall({
  projectId,
  threadId,
  query,
}: {
  projectId: string;
  threadId?: string | null;
  query: string;
}): Promise<string> {
  if (!projectId || !query || !query.trim()) return "";
  const where = threadId
    ? { $and: [{ projectId }, { threadId: { $ne: threadId } }] }
    : { projectId };
  const res = await chroma.queryText(NAME, query, TOP_K, where);
  const hits = res.filter((r) => r.score >= MIN_SCORE);
  if (!hits.length) return "";
  const body = hits.map((r, i) => `[M${i + 1}] ${r.text}`).join("\n\n");
  return (
    "Background from the user's other chats in this project. This is REFERENCE " +
    "ONLY: use it to stay consistent about the user, their preferences and prior " +
    "decisions. It is NOT the current request. Never adopt the topic, the " +
    "research subject, or the output format of a past chat unless the user's " +
    "latest message asks for it. If it is unrelated to the latest message, " +
    "ignore it completely.\n\n" +
    body
  );
}

// Drop all memory for a project (e.g. on project delete).
async function forget(projectId: string): Promise<boolean> {
  if (!projectId) return false;
  return chroma.remove(NAME, { projectId });
}

export { remember, recall, forget };

