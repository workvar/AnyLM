// The only bridge between the renderer and the main process.
//
// The object below is annotated with AnyLmApi (src/types/api.d.ts), which is
// the same type the renderer sees on `window.api`. Renaming or re-signing a
// method on either side is now a compile error rather than a runtime undefined.
import { contextBridge, ipcRenderer } from "electron";

const api: AnyLmApi = {
  // Platform ("darwin" | "win32" | "linux"), for native-feel styling.
  platform: process.platform,

  // Auth
  authMe: () => ipcRenderer.invoke("auth:me"),
  authLogin: (email, password) => ipcRenderer.invoke("auth:login", { email, password }),
  authRegister: (email, password, name) =>
    ipcRenderer.invoke("auth:register", { email, password, name }),
  authOAuth: (provider) => ipcRenderer.invoke("auth:oauth", provider),
  authLogout: () => ipcRenderer.invoke("auth:logout"),

  // Governance: orgs, policies, usage metering.
  gov: (method, path, body) => ipcRenderer.invoke("gov:api", { method, path, body }),
  govEffective: () => ipcRenderer.invoke("gov:effective"),
  govIdentity: () => ipcRenderer.invoke("gov:identity"),
  exportUsage: (orgId) => ipcRenderer.invoke("gov:export-usage", orgId),

  // Working folder (sandbox for file tools)
  workspaceGet: () => ipcRenderer.invoke("workspace:get"),
  workspacePick: () => ipcRenderer.invoke("workspace:pick"),
  workspaceClear: () => ipcRenderer.invoke("workspace:clear"),

  // Tools (model function calling)
  toolsList: () => ipcRenderer.invoke("tools:list"),
  toolsSave: (tool) => ipcRenderer.invoke("tools:save", tool),
  toolsDelete: (id) => ipcRenderer.invoke("tools:delete", id),
  toolsToggle: (id, enabled) => ipcRenderer.invoke("tools:toggle", { id, enabled }),
  // Skills (instruction + tool bundles, incl. Google Calendar / Outlook)
  skillsList: () => ipcRenderer.invoke("skills:list"),
  skillsSave: (skill) => ipcRenderer.invoke("skills:save", skill),
  skillsDelete: (id) => ipcRenderer.invoke("skills:delete", id),
  skillsToggle: (id, enabled) => ipcRenderer.invoke("skills:toggle", { id, enabled }),
  skillsConnectors: () => ipcRenderer.invoke("skills:connectors"),
  skillsConnect: (provider) => ipcRenderer.invoke("skills:connect", provider),
  skillsDisconnect: (provider) => ipcRenderer.invoke("skills:disconnect", provider),

  // Descriptive AI activity trail (thinking / tools / status).
  onActivity: (cb) => {
    const fn = (_e, m) => cb(m);
    ipcRenderer.on("chat:activity", fn);
    return () => ipcRenderer.removeListener("chat:activity", fn);
  },
  onChatContext: (cb) => {
    const fn = (_e, m) => cb(m);
    ipcRenderer.on("chat:context", fn);
    return () => ipcRenderer.removeListener("chat:context", fn);
  },
  // Risky-tool confirmations: main asks, renderer answers.
  onToolConfirm: (cb) => {
    const fn = (_e, m) => cb(m);
    ipcRenderer.on("chat:tool-confirm", fn);
    return () => ipcRenderer.removeListener("chat:tool-confirm", fn);
  },
  replyToolConfirm: (token, approved) =>
    ipcRenderer.send("chat:tool-confirm-reply", { token, approved }),
  // A generated document is ready (shown as a file card in the chat).
  onFileGenerated: (cb) => {
    const fn = (_e, m) => cb(m);
    ipcRenderer.on("chat:file", fn);
    return () => ipcRenderer.removeListener("chat:file", fn);
  },
  pfilesPreview: (projectId, name) => ipcRenderer.invoke("pfiles:preview", { projectId, name }),
  // Policy warnings emitted while a chat request is being processed.
  onGovernance: (cb) => {
    const fn = (_e, m) => cb(m);
    ipcRenderer.on("chat:governance", fn);
    return () => ipcRenderer.removeListener("chat:governance", fn);
  },
  onAsk: (cb) => {
    const fn = (_e, m) => cb(m);
    ipcRenderer.on("chat:ask", fn);
    return () => ipcRenderer.removeListener("chat:ask", fn);
  },
  replyAsk: (token, answer) => ipcRenderer.send("chat:ask-reply", { token, answer }),
  cancelChat: (id) => ipcRenderer.send("chat:cancel", { id }),

  // Settings
  getSettings: () => ipcRenderer.invoke("settings:get"),
  setSettings: (patch) => ipcRenderer.invoke("settings:set", patch),
  getVersion: () => ipcRenderer.invoke("app:version"),

  // Local OpenAI-compatible endpoint
  proxyStatus: () => ipcRenderer.invoke("proxy:status"),

  // General knowledge base
  knowledgeCount: () => ipcRenderer.invoke("knowledge:count"),
  knowledgeClear: () => ipcRenderer.invoke("knowledge:clear"),

  // Customize (personal context applied to every chat)
  userContextGet: () => ipcRenderer.invoke("usercontext:get"),
  userContextSet: (patch) => ipcRenderer.invoke("usercontext:set", patch),

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
  cancelUpdate: () => ipcRenderer.invoke("update:cancel"),
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
  modelsSystem: () => ipcRenderer.invoke("models:system"),
  modelsCatalog: () => ipcRenderer.invoke("models:catalog"),
  modelsSearch: (query, installedOnly) =>
    ipcRenderer.invoke("models:search", query, installedOnly),
  summarizeChat: (model, messages) => ipcRenderer.invoke("chat:summarize", { model, messages }),

  // Projects
  listProjects: () => ipcRenderer.invoke("projects:list"),
  getProject: (id) => ipcRenderer.invoke("projects:get", id),
  createProject: (data) => ipcRenderer.invoke("projects:create", data),
  updateProject: (id, patch) => ipcRenderer.invoke("projects:update", { id, patch }),
  deleteProject: (id) => ipcRenderer.invoke("projects:delete", id),

  // Project folder on disk (generated files, viewer, exports)
  pfilesDefaultBase: () => ipcRenderer.invoke("pfiles:default-base"),
  pfilesPickFolder: () => ipcRenderer.invoke("pfiles:pick-folder"),
  pfilesList: (projectId) => ipcRenderer.invoke("pfiles:list", projectId),
  graphSummary: (projectId) => ipcRenderer.invoke("graph:summary", projectId),
  pfilesRead: (projectId, name) => ipcRenderer.invoke("pfiles:read", { projectId, name }),
  pfilesSaveMd: (projectId, title, markdown) =>
    ipcRenderer.invoke("pfiles:save-md", { projectId, title, markdown }),
  pfilesSavePdf: (projectId, title, html, text) =>
    ipcRenderer.invoke("pfiles:save-pdf", { projectId, title, html, text }),
  pfilesReveal: (projectId) => ipcRenderer.invoke("pfiles:reveal", projectId),
  pfilesShow: (dir, name) => ipcRenderer.invoke("pfiles:show", { dir, name }),
  pfilesOpen: (dir, name) => ipcRenderer.invoke("pfiles:open", { dir, name }),
  pfilesAppsFor: (dir, name) => ipcRenderer.invoke("pfiles:apps-for", { dir, name }),
  pfilesOpenWith: (dir, name, appId) =>
    ipcRenderer.invoke("pfiles:open-with", { dir, name, appId }),
  pfilesExists: (dir, name) => ipcRenderer.invoke("pfiles:exists", { dir, name }),
  pfilesSetLocation: (projectId, dir) =>
    ipcRenderer.invoke("pfiles:set-location", { projectId, dir }),

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
  chat: (payload, onChunk, onId) => {
    return new Promise((resolve, reject) => {
      const id = Math.random().toString(36).slice(2);
      if (onId) onId(id);
      const chunk = (_e, m) => m.id === id && onChunk(m.text);
      const done = (_e, m) => {
        if (m.id !== id) return;
        cleanup();
        resolve({ full: m.full, usage: m.usage, stopped: !!m.stopped });
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
};

contextBridge.exposeInMainWorld("api", api);
