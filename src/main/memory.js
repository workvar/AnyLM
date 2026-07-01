// Cross-thread project memory, backed by ChromaDB. Chats inside one project
// share what the user tells the model (name, preferences, decisions): each
// completed exchange is embedded and stored, and relevant memories from the
// project's OTHER threads are retrieved into the system prompt.
const chroma = require("./chroma");

const TOP_K = 4;
const NAME = chroma.PROJECT_MEMORY;

// Store one exchange (user + assistant) as a memory record for the project.
async function remember({ projectId, threadId, userText, assistantText }) {
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
async function recall({ projectId, threadId, query }) {
  if (!projectId || !query || !query.trim()) return "";
  const where = threadId
    ? { $and: [{ projectId }, { threadId: { $ne: threadId } }] }
    : { projectId };
  const res = await chroma.queryText(NAME, query, TOP_K, where);
  const hits = res.filter((r) => r.score > 0);
  if (!hits.length) return "";
  const body = hits.map((r, i) => `[M${i + 1}] ${r.text}`).join("\n\n");
  return (
    "Relevant memory from other chats in this project (shared context — use it " +
    "to stay consistent about the user, their preferences, and prior decisions):\n\n" +
    body
  );
}

// Drop all memory for a project (e.g. on project delete).
async function forget(projectId) {
  if (!projectId) return false;
  return chroma.remove(NAME, { projectId });
}

module.exports = { remember, recall, forget };
