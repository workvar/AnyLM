// Shared renderer state.
export const state = {
  view: "projects", // main area: "projects" | "project" | "convo"
  mode: null, // active conversation kind: "project" | "chat" | null
  projects: [], // project grid summaries
  recents: [], // global recent conversations (sidebar)
  current: null, // full active project (project mode) or chat (chat mode)
  viewProject: null, // project whose chats grid is shown (project-detail view)
  threads: [], // active project's thread summaries
  thread: null, // active project thread (project mode)
  models: [], // available Ollama model names
  lastModel: "", // last model the user selected (new chats default to it)
  chat: [], // [{ role, content }] for the current session
  showArchived: false, // projects grid: show archived instead of active
  projectSort: "updated", // "updated" | "name"
  projectQuery: "", // projects grid search text
  modelsQuery: "",  // models view search text
  modelsFilter: "all", // "all" | "installed"
};
