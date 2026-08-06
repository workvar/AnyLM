import { app, ipcMain, dialog } from "electron";
import * as ollama from "./ollama";
import * as store from "./store";
import * as chats from "./chats";
import * as context from "./context";
import * as memory from "./memory";
import * as chroma from "./chroma";
import * as vectorstore from "./vectorstore";
import * as embed from "./embed";
import * as auth from "./auth";
import * as settings from "./settings";
import * as updater from "./updater";
import * as governance from "./governance";
import * as identity from "./identity";
import * as scheduler from "./scheduler";
import * as toolsRegistry from "./tools/registry";
import * as toolsExec from "./tools/exec";
import * as skillsRegistry from "./skills/registry";
import * as skillsExec from "./skills/exec";
import * as workspace from "./workspace";
import * as proxy from "./proxy/server";
import { shell } from "electron";
import { waitForConnector } from "./protocol";
import * as projectFiles from "./project-files";
import * as userContext from "./user-context";

// Pending risky-tool confirmations, keyed by a one-time token.
const pendingConfirms = new Map();

function registerIpc() {
  // Settings
  ipcMain.handle("settings:get", () => settings.read());
  ipcMain.handle("settings:set", (_e, patch) => {
    const next = settings.write(patch);
    // Keep the live updater in step with the install-on-quit preference.
    if ("installUpdatesOnQuit" in patch) updater.applyPreferences();
    // Apply proxy changes immediately rather than at next launch.
    if ("proxyEnabled" in patch || "proxyPort" in patch) {
      proxy.stop();
      if (next.proxyEnabled) proxy.start(next.proxyPort);
    }
    return next;
  });
  ipcMain.handle("app:version", () => app.getVersion());

  // Local OpenAI-compatible endpoint (was the backend's /v1 controller).
  ipcMain.handle("proxy:status", () => proxy.status());

  // General knowledge base
  ipcMain.handle("knowledge:count", () => vectorstore.count());
  ipcMain.handle("knowledge:clear", async () => {
    await vectorstore.clear();
    return true;
  });

  // Customize: personal context applied to every chat.
  ipcMain.handle("usercontext:get", () => userContext.get());
  ipcMain.handle("usercontext:set", (_e, patch) => userContext.set(patch));

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
  ipcMain.handle("update:cancel", () => updater.cancel());
  ipcMain.handle("update:install", () => updater.install());

  // Auth
  ipcMain.handle("auth:register", async (_e, { email, password, name }) => {
    const user = await auth.register(email, password, name);
    await identity.refresh(user);
    return user;
  });
  ipcMain.handle("auth:login", async (_e, { email, password }) => {
    const user = await auth.login(email, password);
    await identity.refresh(user);
    return user;
  });
  ipcMain.handle("auth:oauth", async (_e, provider) => {
    const user = await auth.oauth(provider);
    await identity.refresh(user);
    return user;
  });
  ipcMain.handle("auth:logout", () => {
    identity.clear();
    governance.invalidate();
    return auth.logout();
  });
  ipcMain.handle("auth:me", async () => {
    if (!auth.loadTokens()) return null;
    try {
      const user = await auth.me();
      await identity.refresh(user);
      return user;
    } catch {
      return null;
    }
  });

  // Governance API bridge: orgs, policies, usage. Path-whitelisted.
  ipcMain.handle("gov:api", async (_e, { method, path, body }) => {
    const ok = ["/orgs", "/policies", "/usage", "/apikeys", "/invites"].some((p) =>
      String(path).startsWith(p)
    );
    if (!ok) throw new Error("Path not allowed");
    const result = await auth.request(method, path, body);
    if (method !== "GET") {
      governance.invalidate();
      // Org membership may have changed (create/join); keep identity fresh.
      if (String(path).startsWith("/orgs")) await identity.refresh();
    }
    return result;
  });
  ipcMain.handle("gov:effective", () => governance.effective(true));
  ipcMain.handle("gov:identity", () => identity.get());

  // Usage CSV export: pick a destination, fetch, save.
  ipcMain.handle("gov:export-usage", async (_e, orgId) => {
    const stamp = new Date().toISOString().slice(0, 10);
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: "Export usage report",
      defaultPath: `anylm-usage-${stamp}.csv`,
      filters: [{ name: "CSV", extensions: ["csv"] }],
    });
    if (canceled || !filePath) return null;
    await scheduler.exportUsageCsv(orgId, filePath);
    return filePath;
  });

  // Background governance tasks (limit alerts, renewals, scheduled reports).
  scheduler.start();

  // Working folder for file tools
  ipcMain.handle("workspace:get", () => workspace.get());
  ipcMain.handle("workspace:pick", () => workspace.pick());
  ipcMain.handle("workspace:clear", () => {
    workspace.clear();
    return true;
  });

  // Tools (model function calling)
  ipcMain.handle("tools:list", () => toolsRegistry.list());
  ipcMain.handle("tools:save", (_e, tool) => toolsRegistry.save(tool));
  ipcMain.handle("tools:delete", (_e, id) => toolsRegistry.remove(id));
  ipcMain.handle("tools:toggle", (_e, { id, enabled }) => toolsRegistry.toggle(id, enabled));
  // Skills (instruction + tool bundles, incl. Google Calendar / Outlook)
  ipcMain.handle("skills:list", () => skillsRegistry.list());
  ipcMain.handle("skills:save", (_e, skill) => skillsRegistry.save(skill));
  ipcMain.handle("skills:delete", (_e, id) => skillsRegistry.remove(id));
  ipcMain.handle("skills:toggle", (_e, { id, enabled }) => skillsRegistry.toggle(id, enabled));
  // Connector status for the Skills view (connected / configured flags).
  ipcMain.handle("skills:connectors", () => auth.request("GET", "/connectors"));
  // Connect flow: backend builds the consent URL, we open the browser and
  // wait for the anylm://connectors/callback deep link.
  ipcMain.handle("skills:connect", async (_e, provider) => {
    const { url } = await auth.request("POST", `/connectors/${provider}/start`);
    const pending = waitForConnector();
    await shell.openExternal(url);
    await pending;
    return auth.request("GET", "/connectors");
  });
  ipcMain.handle("skills:disconnect", async (_e, provider) => {
    await auth.request("DELETE", `/connectors/${provider}`);
    return auth.request("GET", "/connectors");
  });
  ipcMain.on("chat:tool-confirm-reply", (_e, { token, approved }) => {
    const resolve = pendingConfirms.get(token);
    if (resolve) {
      pendingConfirms.delete(token);
      resolve(!!approved);
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
  // Chat-eligible models, filtered through model-allowlist policies.
  ipcMain.handle("models:list", async () => {
    const models = await ollama.listModels();
    return governance.filterModels(models);
  });
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
  ipcMain.handle("projects:create", (_e, data) => {
    const project = store.create(data || {});
    // Associate a folder on disk (Documents/AnyLM/Projects/<name> by default;
    // a custom base directory can be chosen at creation).
    const custom = data && data.folderBase ? projectFiles.childPath(data.folderBase, project.name) : null;
    projectFiles.ensureFolder(project, custom);
    return store.get(project.id);
  });
  ipcMain.handle("projects:update", (_e, { id, patch }) => store.update(id, patch));
  ipcMain.handle("projects:delete", (_e, id) => {
    // Drop the project's context chunks and shared memory from Chroma.
    context.removeProject(id).catch(() => {});
    memory.forget(id).catch(() => {});
    return store.remove(id);
  });

  // Project folder on disk: generated files, viewer reads, exports.
  ipcMain.handle("pfiles:default-base", () => projectFiles.defaultBase());
  ipcMain.handle("pfiles:pick-folder", async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: "Choose project folder location",
      properties: ["openDirectory", "createDirectory"],
    });
    return canceled || !filePaths.length ? null : filePaths[0];
  });
  ipcMain.handle("pfiles:list", (_e, projectId) => projectFiles.listFiles(projectId));
  ipcMain.handle("pfiles:read", (_e, { projectId, name }) => projectFiles.readFile(projectId, name));
  ipcMain.handle("pfiles:preview", (_e, { projectId, name }) =>
    projectFiles.previewFile(projectId, name)
  );
  ipcMain.handle("pfiles:save-md", (_e, { projectId, title, markdown }) =>
    projectFiles.saveMarkdown(projectId, title, markdown)
  );
  ipcMain.handle("pfiles:save-pdf", (_e, { projectId, title, html, text }) =>
    projectFiles.savePdf(projectId, title, html, text)
  );
  ipcMain.handle("pfiles:reveal", (_e, projectId) => projectFiles.reveal(projectId));
  ipcMain.handle("pfiles:show", (_e, { dir, name }) => projectFiles.showGenerated(dir, name));
  ipcMain.handle("pfiles:open", (_e, { dir, name }) => projectFiles.openGenerated(dir, name));
  ipcMain.handle("pfiles:set-location", (_e, { projectId, dir }) =>
    projectFiles.ensureFolder(store.get(projectId), dir)
  );

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
    // Knowledge flowing OUT: mirror this doc into the general store, and into
    // the organization's shared store when the project opts in.
    if (project.exportToGeneral || project.shareToOrg) {
      vectorstore
        .add([{ text: file.content || "", source: `project:${project.name}` }], {
          toOrg: !!project.shareToOrg,
        })
        .catch(() => {});
    }
    return store.getPublic(projectId);
  });
  ipcMain.handle("context:remove", async (_e, { projectId, contextId }) => {
    await context.removeContext(projectId, contextId).catch(() => {});
    return store.removeContext(projectId, contextId);
  });

  // Streaming chat
  ipcMain.on("chat:start", async (event, { id, projectId, threadId, model, messages, attachments, useTools }) => {
    const send = (channel, payload) => {
      if (!event.sender.isDestroyed()) event.sender.send(channel, payload);
    };
    try {
      const project = store.get(projectId);
      const useModel = model || (project && project.model);
      if (!useModel) throw new Error("No model selected");

      const lastUser = [...messages].reverse().find((m) => m.role === "user");

      // --- Governance: pre-flight limits/budget/rate/model, then content. ---
      const warnings = [];
      const pre = await governance.preflight(useModel, estimateTokens(messages));
      if (pre.warnings) warnings.push(...pre.warnings);
      if (!pre.allowed) throw new Error(pre.reason || "Blocked by organization policy.");
      if (lastUser) {
        const verdict = await governance.evaluatePrompt(lastUser.content);
        if (verdict.blocked) throw new Error(verdict.reason);
        warnings.push(...verdict.warnings);
        lastUser.content = verdict.text; // may be redacted
      }
      if (attachments && attachments.docs) {
        for (const d of attachments.docs) {
          const v = await governance.evaluatePrompt(d.text || "");
          if (v.blocked) throw new Error(`${v.reason} (attachment "${d.name}")`);
          warnings.push(...v.warnings);
          d.text = v.text;
        }
      }
      if (warnings.length) send("chat:governance", { id, warnings });

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

      // Enabled skills add their usage instructions when tools are on.
      if (useTools) {
        const skillBlock = skillsRegistry.instructionsBlock();
        if (skillBlock) blocks.push(skillBlock);
        // Working folder: tells the model where file tools operate.
        const wsBlock = workspace.promptBlock();
        if (wsBlock) blocks.push(wsBlock);
      }

      // Personal context the user set in Customize, applied to every chat.
      const userBlock = userContext.promptBlock();
      if (userBlock) blocks.push(userBlock);

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

      // Tool calling: when enabled, run an agent loop — the model may call
      // tools; results are appended and the model is invoked again. Enabled
      // skills contribute their tools alongside the global tool registry.
      let toolDefs = null;
      let skillToolAllow = null;
      if (useTools) {
        const base = toolsRegistry.ollamaTools();
        const seen = new Set(base.map((d) => d.function.name));
        const fromSkills = skillsRegistry.ollamaTools().filter((d) => !seen.has(d.function.name));
        toolDefs = [...base, ...fromSkills];
        skillToolAllow = skillsRegistry.customToolNames();
      }
      const confirm = (tool, args) =>
        new Promise((resolve) => {
          const token = Math.random().toString(36).slice(2);
          pendingConfirms.set(token, resolve);
          send("chat:tool-confirm", {
            id,
            token,
            tool: { name: tool.name, description: tool.description },
            args,
          });
          // Auto-deny if the user doesn't answer within 2 minutes.
          setTimeout(() => {
            if (pendingConfirms.has(token)) {
              pendingConfirms.delete(token);
              resolve(false);
            }
          }, 120_000);
        });

      let result;
      let totalPrompt = 0;
      let totalCompletion = 0;
      let rounds = 0;
      for (;;) {
        result = await ollama.chatStream(
          useModel,
          full,
          (piece) => send("chat:chunk", { id, text: piece }),
          toolDefs
        );
        totalPrompt += result.promptTokens || 0;
        totalCompletion += result.completionTokens || 0;
        const calls = result.toolCalls || [];
        // Folder organizing / coding tasks need more tool rounds than Q&A.
        if (!toolDefs || !calls.length || rounds >= 15) break;
        rounds += 1;
        full.push({ role: "assistant", content: result.text, tool_calls: calls });
        for (const call of calls) {
          const fname = call.function?.name || "";
          const fargs = call.function?.arguments || {};
          send("chat:tool", { id, name: fname, args: fargs, status: "running" });
          // Connector-skill tools (gcal_*, outlook_*) run through the skills
          // executor; everything else goes to the plain tools executor.
          const output = skillsExec.owns(fname)
            ? await skillsExec.execute(fname, fargs, confirm)
            : await toolsExec.execute(fname, fargs, confirm, skillToolAllow, {
                projectId: project ? project.id : null,
                // Generated documents surface as a clickable file card in the chat.
                onFile: (file) => send("chat:file", { id, ...file }),
              });
          send("chat:tool", {
            id,
            name: fname,
            args: fargs,
            status: "done",
            output: String(output).slice(0, 400),
          });
          full.push({ role: "tool", content: String(output), tool_name: fname });
        }
      }
      const text = result.text;

      // Meter real token consumption against the user's limits/budget.
      governance.report(
        useModel,
        totalPrompt || estimateTokens(full),
        totalCompletion || Math.round(text.length / 4)
      );
      scheduler.checkSoon(); // fire limit alerts promptly if a threshold was crossed

      // Compliance logging: stored server-side only for orgs that enabled it.
      if (lastUser && text) {
        auth
          .request("POST", "/logs", {
            model: useModel,
            prompt: lastUser.content,
            response: text,
            flags: warnings,
          })
          .catch(() => {});
      }

      // Context-window utilization: prompt sent + the new reply.
      const ctx = await modelContext(useModel);
      const tokens =
        (totalPrompt || estimateTokens(full)) +
        (totalCompletion || Math.round(text.length / 4));
      const percent = Math.min(100, Math.round((tokens / ctx) * 100));
      send("chat:done", {
        id,
        full: text,
        usage: {
          tokens,
          ctx,
          percent,
          promptTokens: totalPrompt || estimateTokens(full),
          completionTokens: totalCompletion || Math.round(text.length / 4),
          measured: !!(totalPrompt || totalCompletion), // real Ollama counts vs ~4 chars/token estimate
        },
      });

      // Persist the turn: project chats build shared project memory; standalone
      // chats feed the general knowledge base.
      if (project && lastUser && text) {
        memory
          .remember({ projectId: project.id, threadId, userText: lastUser.content, assistantText: text })
          .catch(() => {});
        // Decisions log is opt-in per project (Settings → "Auto-log exchanges").
        if (project.autoLog) {
          projectFiles.appendLog(project.id, { userText: lastUser.content, assistantText: text });
        }
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

export { registerIpc };

