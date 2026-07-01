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

  // General knowledge base
  knowledgeCount: () => ipcRenderer.invoke("knowledge:count"),
  knowledgeClear: () => ipcRenderer.invoke("knowledge:clear"),

  // Embedding model (RAG)
  embedStatus: () => ipcRenderer.invoke("embed:status"),
  embedRequirements: () => ipcRenderer.invoke("embed:requirements"),
  embedState: () => ipcRenderer.invoke("embed:state"),
  // Kick off the download; onProgress(state) fires until done/error.
  installEmbed: (onProgress) => {
    const fn = (_e, s) => onProgress(s);
    ipcRenderer.on("embed:progress", fn);
    ipcRenderer.send("embed:install");
  },
  onEmbedProgress: (cb) => {
    const fn = (_e, s) => cb(s);
    ipcRenderer.on("embed:progress", fn);
    return () => ipcRenderer.removeListener("embed:progress", fn);
  },

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
  // Memory backend (Chroma) status
  chromaStatus: () => ipcRenderer.invoke("chroma:status"),
  listModels: () => ipcRenderer.invoke("models:list"),
  modelInfo: (model) => ipcRenderer.invoke("models:info", model),
  summarizeChat: (model, messages) => ipcRenderer.invoke("chat:summarize", { model, messages }),

  // Projects
  listProjects: () => ipcRenderer.invoke("projects:list"),
  getProject: (id) => ipcRenderer.invoke("projects:get", id),
  createProject: (data) => ipcRenderer.invoke("projects:create", data),
  updateProject: (id, patch) => ipcRenderer.invoke("projects:update", { id, patch }),
  deleteProject: (id) => ipcRenderer.invoke("projects:delete", id),

  // Global recents (standalone chats + project threads)
  recentsList: (limit) => ipcRenderer.invoke("recents:list", limit),

  // Standalone chats
  listChats: () => ipcRenderer.invoke("chats:list"),
  getChat: (id) => ipcRenderer.invoke("chats:get", id),
  createChat: (data) => ipcRenderer.invoke("chats:create", data),
  updateChat: (id, patch) => ipcRenderer.invoke("chats:update", { id, patch }),
  deleteChat: (id) => ipcRenderer.invoke("chats:delete", id),

  // Auto-title a conversation
  titleChat: (model, messages) => ipcRenderer.invoke("chat:title", { model, messages }),

  // Subfolders inside a project
  listFolders: (projectId) => ipcRenderer.invoke("folders:list", projectId),
  addFolder: (projectId, name) => ipcRenderer.invoke("folders:add", { projectId, name }),
  renameFolder: (projectId, folderId, name) =>
    ipcRenderer.invoke("folders:rename", { projectId, folderId, name }),
  removeFolder: (projectId, folderId) =>
    ipcRenderer.invoke("folders:remove", { projectId, folderId }),

  // Per-project chat threads
  listThreads: (projectId) => ipcRenderer.invoke("threads:list", projectId),
  getThread: (projectId, threadId) => ipcRenderer.invoke("threads:get", { projectId, threadId }),
  createThread: (projectId, data) => ipcRenderer.invoke("threads:create", { projectId, data }),
  updateThread: (projectId, threadId, patch) =>
    ipcRenderer.invoke("threads:update", { projectId, threadId, patch }),
  deleteThread: (projectId, threadId) =>
    ipcRenderer.invoke("threads:delete", { projectId, threadId }),

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
        resolve({ full: m.full, usage: m.usage });
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

  // Model management
  deleteModel: (model) => ipcRenderer.invoke("models:delete", model),
  pullModel: (model, onProgress) => {
    return new Promise((resolve, reject) => {
      const fn = (_e, progress) => {
        if (progress.error) {
          cleanup();
          reject(new Error(progress.error));
        } else {
          onProgress(progress);
        }
      };
      const done = () => {
        cleanup();
        resolve();
      };
      function cleanup() {
        ipcRenderer.removeListener("models:pull-progress", fn);
      }
      ipcRenderer.on("models:pull-progress", fn);
      ipcRenderer.once("models:pull-complete", done);
      ipcRenderer.send("models:pull", model);
    });
  },
  cancelPullModel: (model) => ipcRenderer.send("models:cancel-pull", model),
});
