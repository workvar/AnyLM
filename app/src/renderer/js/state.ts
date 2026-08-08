// Shared renderer state.
export const state = {
  view: "projects", // main area: "projects" | "project" | "convo" | "settings"
  settingsSection: "general", // Settings hub: general | models | org | tools | skills | customize
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
  sidebarQuery: "", // left rail search text (projects + chats)
  sidebarPane: "chats", // sidebar content: "chats" | "artifacts"
  modelsQuery: "",  // models view search text
  modelsFilter: "all", // "all" | "installed"
  modelsLayout: "list", // "list" | "grid"
};
