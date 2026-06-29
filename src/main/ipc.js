const { app, ipcMain } = require("electron");
const ollama = require("./ollama");
const store = require("./store");
const chats = require("./chats");
const context = require("./context");
const vectorstore = require("./vectorstore");
const auth = require("./auth");
const settings = require("./settings");
const updater = require("./updater");

function registerIpc() {
  // Settings
  ipcMain.handle("settings:get", () => settings.read());
  ipcMain.handle("settings:set", (_e, patch) => settings.write(patch));
  ipcMain.handle("app:version", () => app.getVersion());

  // General knowledge base
  ipcMain.handle("knowledge:count", () => vectorstore.count());
  ipcMain.handle("knowledge:clear", () => {
    vectorstore.clear();
    return true;
  });

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
  ipcMain.handle("models:info", (_e, model) => modelContext(model));

  // Projects
  ipcMain.handle("projects:list", () => store.list());
  ipcMain.handle("projects:get", (_e, id) => store.getPublic(id));
  ipcMain.handle("projects:create", (_e, data) => store.create(data));
  ipcMain.handle("projects:update", (_e, { id, patch }) => store.update(id, patch));
  ipcMain.handle("projects:delete", (_e, id) => store.remove(id));

  // Per-project chat threads
  ipcMain.handle("threads:list", (_e, projectId) => store.listThreads(projectId));
  ipcMain.handle("threads:get", (_e, { projectId, threadId }) =>
    store.getThread(projectId, threadId)
  );
  ipcMain.handle("threads:create", (_e, { projectId, data }) =>
    store.createThread(projectId, data || {})
  );
  ipcMain.handle("threads:update", (_e, { projectId, threadId, patch }) =>
    store.updateThread(projectId, threadId, patch)
  );
  ipcMain.handle("threads:delete", (_e, { projectId, threadId }) =>
    store.deleteThread(projectId, threadId)
  );

  // Summarize a conversation (used to "compact" into a fresh thread).
  ipcMain.handle("chat:summarize", async (_e, { model, messages }) => {
    const transcript = (messages || [])
      .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
      .join("\n\n");
    const prompt =
      "Summarize the following conversation concisely, preserving key facts, " +
      "decisions, names, and open questions so it can continue seamlessly. " +
      "Reply with the summary only.\n\n---\n" +
      transcript;
    return ollama.generate(model, prompt);
  });

  // Standalone chats
  ipcMain.handle("chats:list", () => chats.list());
  ipcMain.handle("chats:get", (_e, id) => chats.get(id));
  ipcMain.handle("chats:create", (_e, data) => chats.create(data));
  ipcMain.handle("chats:update", (_e, { id, patch }) => chats.update(id, patch));
  ipcMain.handle("chats:delete", (_e, id) => chats.remove(id));

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
    // Knowledge flowing OUT: mirror this doc into the general store.
    if (project.exportToGeneral) {
      vectorstore.add([{ text: file.content || "", source: `project:${project.name}` }]).catch(() => {});
    }
    return store.getPublic(projectId);
  });
  ipcMain.handle("context:remove", (_e, { projectId, contextId }) =>
    store.removeContext(projectId, contextId)
  );

  // Streaming chat
  ipcMain.on("chat:start", async (event, { id, projectId, model, messages, attachments }) => {
    const send = (channel, payload) => {
      if (!event.sender.isDestroyed()) event.sender.send(channel, payload);
    };
    try {
      const project = store.get(projectId);
      const useModel = model || (project && project.model);
      if (!useModel) throw new Error("No model selected");

      const lastUser = [...messages].reverse().find((m) => m.role === "user");
      const blocks = [];

      if (project) {
        // Project's own context (retrieval, else summaries).
        const retrieved = lastUser ? await context.retrieve(project, lastUser.content) : [];
        const base = retrieved.length
          ? context.buildSystemPrompt(project, retrieved)
          : context.buildSummaryPrompt(project);
        if (base) blocks.push(base);
        // Knowledge flowing IN: also consult the general store.
        if (project.importGeneral && lastUser) {
          const gen = await vectorstore.search(lastUser.content, 3);
          if (gen.length) blocks.push(formatGeneral(gen));
        }
      } else if (lastUser) {
        // Standalone chat: draw on the general knowledge base.
        const gen = await vectorstore.search(lastUser.content, 4);
        if (gen.length) blocks.push(formatGeneral(gen));
      }

      // Attached documents become a per-turn context block.
      if (attachments && attachments.docs && attachments.docs.length) {
        blocks.push(
          attachments.docs.map((d) => `Attached document "${d.name}":\n${d.text}`).join("\n\n")
        );
      }

      const system = blocks.join("\n\n---\n\n");
      const full = [];
      if (system) full.push({ role: "system", content: system });
      for (const m of messages) full.push(m);

      // Attach images to the latest user message (vision models).
      if (attachments && attachments.images && attachments.images.length) {
        for (let i = full.length - 1; i >= 0; i--) {
          if (full[i].role === "user") {
            full[i] = { ...full[i], images: attachments.images };
            break;
          }
        }
      }

      const text = await ollama.chatStream(useModel, full, (piece) =>
        send("chat:chunk", { id, text: piece })
      );

      // Context-window utilization: prompt sent + the new reply.
      const ctx = await modelContext(useModel);
      const tokens = estimateTokens(full) + Math.round(text.length / 4);
      const percent = Math.min(100, Math.round((tokens / ctx) * 100));
      send("chat:done", { id, full: text, usage: { tokens, ctx, percent } });

      // Content created in the Chats section feeds the general knowledge base.
      if (!project && lastUser && text) {
        vectorstore.add([{ text: `${lastUser.content}\n${text}`, source: "chat" }]).catch(() => {});
      }
    } catch (e) {
      send("chat:error", { id, error: e.message });
    }
  });
}

// Format general-store excerpts as a system block.
function formatGeneral(items) {
  const body = items.map((r, i) => `[G${i + 1}] ${r.text}`).join("\n\n");
  return `Relevant excerpts from your general knowledge base (use when helpful):\n\n${body}`;
}

// Cached per-model context length (falls back to 4096).
const ctxCache = new Map();
async function modelContext(model) {
  if (!model) return 4096;
  if (ctxCache.has(model)) return ctxCache.get(model);
  const { contextLength } = await ollama.info(model).catch(() => ({ contextLength: null }));
  const ctx = contextLength || 4096;
  ctxCache.set(model, ctx);
  return ctx;
}

// Rough token estimate (~4 chars/token) for a list of chat messages.
function estimateTokens(messages) {
  const chars = messages.reduce((n, m) => n + (m.content ? m.content.length : 0), 0);
  return Math.round(chars / 4);
}

module.exports = { registerIpc };
