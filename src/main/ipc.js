const { app, ipcMain } = require("electron");
const ollama = require("./ollama");
const store = require("./store");
const chats = require("./chats");
const context = require("./context");
const memory = require("./memory");
const chroma = require("./chroma");
const vectorstore = require("./vectorstore");
const embed = require("./embed");
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
  ipcMain.handle("knowledge:clear", async () => {
    await vectorstore.clear();
    return true;
  });

  // Embedding model (RAG)
  ipcMain.handle("embed:status", async () => ({
    model: embed.EMBED_MODEL,
    installed: await embed.isInstalled(),
  }));
  ipcMain.handle("embed:requirements", () => embed.requirements());
  ipcMain.handle("embed:state", () => embed.getState());
  // Streaming install: progress is pushed on "embed:progress".
  ipcMain.on("embed:install", (event) => {
    const send = (payload) => {
      if (!event.sender.isDestroyed()) event.sender.send("embed:progress", payload);
    };
    embed.install(send);
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

  // Memory backend (Chroma) reachability, for the sidebar status dot.
  ipcMain.handle("chroma:status", async () => {
    const s = settings.read();
    return {
      ok: await chroma.available(),
      host: `${s.chromaHost || "localhost"}:${s.chromaPort || 8000}`,
    };
  });

  // Ollama
  ipcMain.handle("ollama:status", () => ollama.status());
  ipcMain.handle("models:list", () => ollama.listModels());
  ipcMain.handle("models:info", (_e, model) => modelContext(model));
  ipcMain.handle("models:delete", (_e, model) => ollama.deleteModel(model));

  // Streaming model pull: progress is pushed on "models:pull-progress".
  ipcMain.on("models:pull", (event, model) => {
    const send = (payload) => {
      if (!event.sender.isDestroyed()) event.sender.send("models:pull-progress", payload);
    };
    ollama.pull(model, send).then(() => {
      if (!event.sender.isDestroyed()) event.sender.send("models:pull-complete", {});
    }).catch((err) => {
      send({ error: err.message });
    });
  });

  ipcMain.on("models:cancel-pull", (_e, model) => {
    // Cancel is handled by the fetch abort in ollama.js
    // For now, we will just log it
    console.log("Cancel pull requested for:", model);
  });

  // Projects
  ipcMain.handle("projects:list", () => store.list());
  ipcMain.handle("projects:get", (_e, id) => store.getPublic(id));
  ipcMain.handle("projects:create", (_e, data) => store.create(data));
  ipcMain.handle("projects:update", (_e, { id, patch }) => store.update(id, patch));
  ipcMain.handle("projects:delete", (_e, id) => {
    // Drop the project's context chunks and shared memory from Chroma.
    context.removeProject(id).catch(() => {});
    memory.forget(id).catch(() => {});
    return store.remove(id);
  });

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

  // Subfolders inside a project
  ipcMain.handle("folders:list", (_e, projectId) => store.listFolders(projectId));
  ipcMain.handle("folders:add", (_e, { projectId, name }) => store.addFolder(projectId, name));
  ipcMain.handle("folders:rename", (_e, { projectId, folderId, name }) =>
    store.renameFolder(projectId, folderId, name)
  );
  ipcMain.handle("folders:remove", (_e, { projectId, folderId }) =>
    store.removeFolder(projectId, folderId)
  );

  // Generate a short title from a conversation (for auto-naming chats).
  ipcMain.handle("chat:title", async (_e, { model, messages }) => {
    const transcript = (messages || [])
      .slice(0, 6)
      .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
      .join("\n");
    const prompt =
      "Write a short, specific title (3 to 6 words) for this conversation. " +
      "Reply with the title only — no quotes, no punctuation at the end.\n\n---\n" +
      transcript;
    return ollama.generate(model, prompt);
  });

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

  // Global recents: standalone chats + project threads, newest first.
  ipcMain.handle("recents:list", (_e, limit) => {
    const standalone = chats.list();
    const threads = store.recentThreads();
    return [...standalone, ...threads]
      .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""))
      .slice(0, limit || 40);
  });

  // Context: chunk + embed on add so chunks (and vectors) are stored for retrieval.
  ipcMain.handle("context:add", async (_e, { projectId, file }) => {
    const project = store.get(projectId);
    if (!project) throw new Error("Project not found");
    const contextId = store.newId();
    const { summary, chunkCount, embedded } = await context.ingest({
      projectId,
      contextId,
      model: project.model,
      name: file.name,
      content: file.content,
    });
    store.addContext(projectId, {
      id: contextId,
      name: file.name,
      chars: (file.content || "").length,
      summary,
      chunkCount,
      embedded,
    });
    // Knowledge flowing OUT: mirror this doc into the general store.
    if (project.exportToGeneral) {
      vectorstore.add([{ text: file.content || "", source: `project:${project.name}` }]).catch(() => {});
    }
    return store.getPublic(projectId);
  });
  ipcMain.handle("context:remove", async (_e, { projectId, contextId }) => {
    await context.removeContext(projectId, contextId).catch(() => {});
    return store.removeContext(projectId, contextId);
  });

  // Streaming chat
  ipcMain.on("chat:start", async (event, { id, projectId, threadId, model, messages, attachments }) => {
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
        // Shared memory retrieved from the project's other threads (Chroma).
        if (lastUser) {
          const mem = await memory.recall({
            projectId: project.id,
            threadId,
            query: lastUser.content,
          });
          if (mem) blocks.push(mem);
        }
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

      // Persist the turn: project chats build shared project memory; standalone
      // chats feed the general knowledge base.
      if (project && lastUser && text) {
        memory
          .remember({ projectId: project.id, threadId, userText: lastUser.content, assistantText: text })
          .catch(() => {});
      } else if (!project && lastUser && text) {
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
