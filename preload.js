const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  // Platform ("darwin" | "win32" | "linux"), for native-feel styling.
  platform: process.platform,

  // Auth
  authMe: () => ipcRenderer.invoke("auth:me"),
  authLogin: (email, password) => ipcRenderer.invoke("auth:login", { email, password }),
  authRegister: (email, password, name) =>
    ipcRenderer.invoke("auth:register", { email, password, name }),
  authOAuth: (provider) => ipcRenderer.invoke("auth:oauth", provider),
  authLogout: () => ipcRenderer.invoke("auth:logout"),

  // Settings
  getSettings: () => ipcRenderer.invoke("settings:get"),
  setSettings: (patch) => ipcRenderer.invoke("settings:set", patch),
  getVersion: () => ipcRenderer.invoke("app:version"),

  // Updates
  checkForUpdate: () => ipcRenderer.invoke("update:check"),
  downloadUpdate: () => ipcRenderer.invoke("update:download"),
  installUpdate: () => ipcRenderer.invoke("update:install"),
  onUpdateStatus: (cb) => {
    const fn = (_e, msg) => cb(msg);
    ipcRenderer.on("update:status", fn);
    return () => ipcRenderer.removeListener("update:status", fn);
  },

  // Ollama
  ollamaStatus: () => ipcRenderer.invoke("ollama:status"),
  listModels: () => ipcRenderer.invoke("models:list"),

  // Projects
  listProjects: () => ipcRenderer.invoke("projects:list"),
  getProject: (id) => ipcRenderer.invoke("projects:get", id),
  createProject: (data) => ipcRenderer.invoke("projects:create", data),
  updateProject: (id, patch) => ipcRenderer.invoke("projects:update", { id, patch }),
  deleteProject: (id) => ipcRenderer.invoke("projects:delete", id),

  // Context references
  addContext: (projectId, file) => ipcRenderer.invoke("context:add", { projectId, file }),
  removeContext: (projectId, contextId) =>
    ipcRenderer.invoke("context:remove", { projectId, contextId }),

  // Streaming chat. onChunk(text) called per token; resolves on done.
  chat: (payload, onChunk) => {
    return new Promise((resolve, reject) => {
      const id = Math.random().toString(36).slice(2);
      const chunk = (_e, m) => m.id === id && onChunk(m.text);
      const done = (_e, m) => {
        if (m.id !== id) return;
        cleanup();
        resolve(m.full);
      };
      const fail = (_e, m) => {
        if (m.id !== id) return;
        cleanup();
        reject(new Error(m.error));
      };
      function cleanup() {
        ipcRenderer.removeListener("chat:chunk", chunk);
        ipcRenderer.removeListener("chat:done", done);
        ipcRenderer.removeListener("chat:error", fail);
      }
      ipcRenderer.on("chat:chunk", chunk);
      ipcRenderer.on("chat:done", done);
      ipcRenderer.on("chat:error", fail);
      ipcRenderer.send("chat:start", { id, ...payload });
    });
  },
});
