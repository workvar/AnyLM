const { app, ipcMain } = require("electron");
const ollama = require("./ollama");
const store = require("./store");
const context = require("./context");
const auth = require("./auth");
const settings = require("./settings");
const updater = require("./updater");

function registerIpc() {
  // Settings
  ipcMain.handle("settings:get", () => settings.read());
  ipcMain.handle("settings:set", (_e, patch) => settings.write(patch));
  ipcMain.handle("app:version", () => app.getVersion());

  // Updates
  ipcMain.handle("update:check", () => updater.check());
  ipcMain.handle("update:download", () => updater.download());
  ipcMain.handle("update:install", () => updater.install());

  // Auth
  ipcMain.handle("auth:register", (_e, { email, password, name }) =>
    auth.register(email, password, name)
  );
  ipcMain.handle("auth:login", (_e, { email, password }) => auth.login(email, password));
  ipcMain.handle("auth:oauth", (_e, provider) => auth.oauth(provider));
  ipcMain.handle("auth:logout", () => auth.logout());
  ipcMain.handle("auth:me", async () => {
    if (!auth.loadTokens()) return null;
    try {
      return await auth.me();
    } catch {
      return null;
    }
  });

  // Ollama
  ipcMain.handle("ollama:status", () => ollama.status());
  ipcMain.handle("models:list", () => ollama.listModels());

  // Projects
  ipcMain.handle("projects:list", () => store.list());
  ipcMain.handle("projects:get", (_e, id) => store.getPublic(id));
  ipcMain.handle("projects:create", (_e, data) => store.create(data));
  ipcMain.handle("projects:update", (_e, { id, patch }) => store.update(id, patch));
  ipcMain.handle("projects:delete", (_e, id) => store.remove(id));

  // Context: chunk + embed on add so chunks (and vectors) are stored for retrieval.
  ipcMain.handle("context:add", async (_e, { projectId, file }) => {
    const project = store.get(projectId);
    if (!project) throw new Error("Project not found");
    const { summary, chunks } = await context.ingest(project.model, file.name, file.content);
    store.addContext(projectId, {
      name: file.name,
      chars: (file.content || "").length,
      summary,
      chunks,
    });
    return store.getPublic(projectId);
  });
  ipcMain.handle("context:remove", (_e, { projectId, contextId }) =>
    store.removeContext(projectId, contextId)
  );

  // Streaming chat
  ipcMain.on("chat:start", async (event, { id, projectId, model, messages }) => {
    const send = (channel, payload) => {
      if (!event.sender.isDestroyed()) event.sender.send(channel, payload);
    };
    try {
      const project = store.get(projectId);
      const useModel = model || (project && project.model);
      if (!useModel) throw new Error("No model selected");

      // Retrieve relevant chunks for the latest user message; fall back to summaries.
      let system = "";
      if (project) {
        const lastUser = [...messages].reverse().find((m) => m.role === "user");
        const retrieved = lastUser ? await context.retrieve(project, lastUser.content) : [];
        system = retrieved.length
          ? context.buildSystemPrompt(project, retrieved)
          : context.buildSummaryPrompt(project);
      }

      const full = [];
      if (system) full.push({ role: "system", content: system });
      for (const m of messages) full.push(m);

      const text = await ollama.chatStream(useModel, full, (piece) =>
        send("chat:chunk", { id, text: piece })
      );
      send("chat:done", { id, full: text });
    } catch (e) {
      send("chat:error", { id, error: e.message });
    }
  });
}

module.exports = { registerIpc };
