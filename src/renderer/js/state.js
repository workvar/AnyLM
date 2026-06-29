// Shared renderer state.
export const state = {
  projects: [], // sidebar summaries
  current: null, // full current project object
  models: [], // available Ollama model names
  chat: [], // [{ role, content }] for the current session
};
