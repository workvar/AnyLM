// Shared renderer state.
export const state = {
  tab: "projects", // sidebar tab: "projects" | "chats"
  mode: null, // active conversation kind: "project" | "chat" | null
  projects: [], // sidebar project summaries
  chats: [], // sidebar chat summaries
  current: null, // full active project or chat object
  threads: [], // project chat-thread summaries (project mode)
  thread: null, // active project thread (project mode)
  models: [], // available Ollama model names
  chat: [], // [{ role, content }] for the current session
};
