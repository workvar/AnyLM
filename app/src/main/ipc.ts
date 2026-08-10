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
import { recoverToolCalls } from "./tools/recover-tool-calls";
import { followUpPromptBlock } from "./tools/follow-up-prompt";
import * as skillsRegistry from "./skills/registry";
import * as skillsExec from "./skills/exec";
import * as workspace from "./workspace";
import { isProjectCodingIntent } from "./project-coding/intent";
import { projectFirstPromptBlock } from "./project-coding/prompt";
import { lookupCodingDocs } from "./project-coding/docs";
import { buildProjectSummary, type ToolOutcome } from "./project-coding/summary";
import * as webSearch from "./tools/web-search";
import * as documentIntent from "./documents/intent";
import * as proxy from "./proxy/server";
import * as projectFiles from "./project-files";
import * as artifacts from "./artifacts";
import { fallbackDir } from "./documents/dest";
import * as openWith from "./open-with";
import * as userContext from "./user-context";
import * as graph from "./graph";
import * as modelCatalog from "./model-catalog";
import { labelFor, detailFor } from "./activity-labels";
import { activitySend, createThoughtTimer } from "./activity";
import { leanComplexity, isPreferentialKnowledge } from "./agents/complexity";
import { classifyComplexity } from "./agents/classify";
import { planTurn } from "./agents/planner";
import { assignKinds } from "./agents/router";
import { runOrchestratedTurn } from "./agents/orchestrator";
import { resolveAgentSettings, modelForRole, modelForStepKind } from "./agents/settings";
import { makeWorkers } from "./agents/workers";
import { modelSupportsThink } from "./think";
import * as appMenu from "./menu";
import * as ollamaSetup from "./ollama-setup/runtime";
import * as startupDeps from "./startup-deps";
import { systemRamUsedPercent } from "./load-guard/system-memory";
import {
  createInFlightMonitor,
  effectiveMaxParallel,
  isOverKillLimit,
} from "./load-guard/guard";
import * as analytics from "./analytics";
import { analyticsAvailable as isAnalyticsAvailable } from "./analytics/availability";
import type { AnalyticsCategory } from "./analytics";
import { env } from "./env";
import { conversationAttachments } from "./chat-attachments";

const ANALYTICS_CATEGORIES = new Set<AnalyticsCategory>([
  "productUsage",
  "reliability",
  "chatEvents",
]);

/** Post-auth identify when consent is granted; never throws. */
function maybeIdentifyAfterAuth(user?: AuthUser | null): void {
  try {
    if (settings.read().analyticsConsent !== true) return;
    const uid = user?.id ?? identity.get().userId;
    if (uid) analytics.identify(uid);
  } catch {
    // never throw into IPC callers
  }
}

/** Clear analytics identity on logout; never throws. */
function maybeResetOnLogout(): void {
  try {
    analytics.reset();
  } catch {
    // never throw into IPC callers
  }
}

/** Coarse chat failure code — never forward raw messages (may contain user content). */
function coarseChatErrorCode(e: unknown): string {
  if (!(e instanceof Error)) return "chat_error";
  const msg = e.message;
  if (msg === "No model selected") return "no_model";
  if (msg === "Blocked by organization policy.") return "policy_blocked";
  return "chat_error";
}

/** Coarse auth failure code — never forward raw messages (may contain credentials). */
function coarseAuthErrorCode(e: unknown): string {
  if (!(e instanceof Error)) return "auth_error";
  const msg = e.message;
  if (msg === "Invalid email or password") return "invalid_credentials";
  if (msg === "Email already registered") return "email_exists";
  if (msg === "Password must be at least 6 characters") return "weak_password";
  if (msg === "Enter a valid email address") return "invalid_email";
  if (msg.startsWith("Too many attempts")) return "rate_limited";
  if (msg === "Sign-in did not return a session") return "oauth_failed";
  if (msg === "Account not found") return "account_not_found";
  if (msg === "This account has been disabled") return "account_disabled";
  return "auth_error";
}

/** Map settings patch keys to coarse feature labels for settings_updated. */
function coarseSettingsFeatures(patch: Record<string, unknown>): string | undefined {
  const map: Record<string, string> = {
    theme: "appearance",
    checkUpdatesOnLaunch: "updates",
    autoDownloadUpdates: "updates",
    installUpdatesOnQuit: "updates",
    notifyUsage: "notifications",
    notifyRenewals: "notifications",
    notifyInterventions: "notifications",
    reportFrequency: "notifications",
    analyticsConsent: "analytics",
    analytics: "analytics",
    proxyEnabled: "proxy",
    proxyPort: "proxy",
    agents: "agents",
    sidebarCollapsed: "layout",
    railCollapsed: "layout",
    lastModel: "model",
    defaultUseToolsForChats: "tools",
    setupWizardCompleted: "onboarding",
    ollamaSetupDeclined: "onboarding",
    embedInstallDeclined: "onboarding",
    chromaHost: "memory",
    chromaPort: "memory",
  };
  const features = new Set<string>();
  for (const key of Object.keys(patch)) {
    const feature = map[key];
    if (feature) features.add(feature);
  }
  if (!features.size) return undefined;
  return [...features].sort().join(",");
}

/** Coarse Ollama setup failure — never forward raw error strings. */
function coarseOllamaError(message?: string): string {
  if (!message) return "start_failed";
  if (message.includes("not installed")) return "not_installed";
  if (message.includes("reachable")) return "timeout";
  return "start_failed";
}

// Pending risky-tool confirmations, keyed by a one-time token → { resolve, id }.
const pendingConfirms = new Map();
// Pending ask_user replies, keyed by token → { resolve, id }.
const pendingAsks = new Map();
// Chat request ids the user stopped.
const cancelledChats = new Set();

/** Unblock confirm/ask waits owned by a cancelled chat request. */
function rejectPendingForChat(id: string): void {
  for (const [token, entry] of pendingConfirms) {
    if (entry.id === id) {
      pendingConfirms.delete(token);
      entry.resolve(false);
    }
  }
  for (const [token, entry] of pendingAsks) {
    if (entry.id === id) {
      pendingAsks.delete(token);
      entry.resolve(null);
    }
  }
}

function registerIpc() {
  // Settings
  ipcMain.on("menu:set-context", (_e, ctx) => {
    appMenu.setContext(ctx && typeof ctx === "object" ? ctx : {});
  });

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
    if (patch && typeof patch === "object" && "analyticsConsent" in patch) {
      const consent = next.analyticsConsent;
      if (typeof consent === "boolean") {
        analytics.trackConsentSet(consent);
        if (consent === true) {
          const uid = identity.get().userId;
          if (uid) analytics.identify(uid);
        }
      }
    }
    if (patch && typeof patch === "object") {
      const feature = coarseSettingsFeatures(patch as Record<string, unknown>);
      if (feature) analytics.trackSettingsUpdated({ feature });
    }
    return next;
  });
  ipcMain.handle("app:version", () => app.getVersion());
  // Sync: preload reads this while building window.api (app is main-only).
  ipcMain.on("app:isPackaged", (event) => {
    event.returnValue = app.isPackaged;
  });

  ipcMain.handle("analytics:available", () =>
    isAnalyticsAvailable({
      gaEnabled: analytics.isEnabled(),
      clarityId: env.clarity.id,
    }),
  );

  ipcMain.handle("analytics:clarity-config", () => {
    const id = env.clarity.id || null;
    const consent = settings.read().analyticsConsent;
    return { id, enabled: Boolean(id) && consent !== false };
  });

  // Renderer → main analytics (validated; invalid drafts are ignored).
  ipcMain.handle("analytics:capture", (_e, draft) => {
    if (!draft || typeof draft !== "object") return;
    const event = (draft as { event?: unknown }).event;
    const category = (draft as { category?: unknown }).category;
    const properties = (draft as { properties?: unknown }).properties;
    if (typeof event !== "string" || !event.trim()) return;
    if (typeof category !== "string" || !ANALYTICS_CATEGORIES.has(category as AnalyticsCategory)) {
      return;
    }
    analytics.capture({
      event,
      category: category as AnalyticsCategory,
      properties:
        properties && typeof properties === "object" && !Array.isArray(properties)
          ? (properties as Record<string, unknown>)
          : undefined,
    });
  });

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
    try {
      const user = await auth.register(email, password, name);
      await identity.refresh(user);
      maybeIdentifyAfterAuth(user);
      analytics.trackUserSignedUp();
      return user;
    } catch (e) {
      analytics.trackAuthenticationFailed({
        operation: "register",
        error_type: coarseAuthErrorCode(e),
      });
      throw e;
    }
  });
  ipcMain.handle("auth:login", async (_e, { email, password }) => {
    try {
      const user = await auth.login(email, password);
      await identity.refresh(user);
      maybeIdentifyAfterAuth(user);
      analytics.trackUserLoggedIn();
      return user;
    } catch (e) {
      analytics.trackAuthenticationFailed({
        operation: "login",
        error_type: coarseAuthErrorCode(e),
      });
      throw e;
    }
  });
  ipcMain.handle("auth:oauth", async (_e, provider) => {
    try {
      const user = await auth.oauth(provider);
      await identity.refresh(user);
      maybeIdentifyAfterAuth(user);
      analytics.trackUserLoggedIn();
      return user;
    } catch (e) {
      analytics.trackAuthenticationFailed({
        operation: "oauth",
        error_type: coarseAuthErrorCode(e),
      });
      throw e;
    }
  });
  ipcMain.handle("auth:logout", () => {
    analytics.trackUserLoggedOut();
    maybeResetOnLogout();
    identity.clear();
    governance.invalidate();
    return auth.logout();
  });
  ipcMain.handle("auth:me", async () => {
    if (!auth.loadTokens()) return null;
    try {
      const user = await auth.me();
      await identity.refresh(user);
      maybeIdentifyAfterAuth(user);
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
    try {
      analytics.trackFileExported({ source: "governance", feature: "usage_csv" });
    } catch {
      // never throw into IPC callers
    }
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
  ipcMain.handle("tools:toggle", (_e, { id, enabled }) => {
    const result = toolsRegistry.toggle(id, enabled);
    try {
      analytics.trackFeatureUsed("tools_toggled");
    } catch {
      // never throw into IPC callers
    }
    return result;
  });
  // Skills (instruction + tool bundles, incl. Google Calendar / Outlook)
  ipcMain.handle("skills:list", () => skillsRegistry.list());
  ipcMain.handle("skills:save", (_e, skill) => skillsRegistry.save(skill));
  ipcMain.handle("skills:delete", (_e, id) => skillsRegistry.remove(id));
  ipcMain.handle("skills:toggle", (_e, { id, enabled }) => skillsRegistry.toggle(id, enabled));
  // Connector status for the Skills view (connected / configured flags).
  ipcMain.handle("skills:connectors", () => auth.request("GET", "/connectors"));
  // Connect flow: connectors.connect() opens the browser and waits on a
  // loopback callback (PKCE). No deep-link wait needed.
  ipcMain.handle("skills:connect", async (_e, provider) => {
    await auth.request("POST", `/connectors/${provider}/start`);
    return auth.request("GET", "/connectors");
  });
  ipcMain.handle("skills:disconnect", async (_e, provider) => {
    await auth.request("DELETE", `/connectors/${provider}`);
    return auth.request("GET", "/connectors");
  });
  ipcMain.on("chat:tool-confirm-reply", (_e, { token, approved }) => {
    const entry = pendingConfirms.get(token);
    if (entry) {
      pendingConfirms.delete(token);
      entry.resolve(!!approved);
    }
  });
  ipcMain.on("chat:ask-reply", (_e, { token, answer }) => {
    const entry = pendingAsks.get(token);
    if (entry) {
      pendingAsks.delete(token);
      entry.resolve(answer);
    }
  });
  ipcMain.on("chat:cancel", (_e, { id }) => {
    if (!id) return;
    cancelledChats.add(id);
    // Unblock await confirm()/ask() so the agent loop can see cancelledChats.
    rejectPendingForChat(id);
  });

  // Memory backend (Chroma) reachability, for the sidebar status dot.
  ipcMain.handle("chroma:status", async () => {
    const s = settings.read();
    return {
      ok: await chroma.available(),
      host: `${s.chromaHost || "localhost"}:${s.chromaPort || 8000}`,
    };
  });

  // Bundled + external dependency report from the pre-window startup check.
  ipcMain.handle("startup:deps", async () => {
    return startupDeps.getLastReport() ?? (await startupDeps.ensureReady());
  });
  ipcMain.handle("startup:retry", () => startupDeps.ensureReady());

  // Ollama
  ipcMain.handle("ollama:status", () => ollama.status());
  ipcMain.handle("ollama:probe", () => ollamaSetup.probeRuntime());
  ipcMain.handle("ollama:start", async () => {
    const result = await ollamaSetup.startRuntime();
    if (result.ok) analytics.trackOllamaSetupCompleted();
    else analytics.trackOllamaSetupFailed({ error_type: coarseOllamaError(result.error) });
    return result;
  });
  ipcMain.handle("ollama:openDownload", () => ollamaSetup.openDownload());
  // Chat-eligible models, filtered through model-allowlist policies.
  ipcMain.handle("models:list", async () => {
    const models = await ollama.listModels();
    return governance.filterModels(models);
  });
  ipcMain.handle("models:info", (_e, model) => modelContext(model));
  ipcMain.handle("models:delete", (_e, model) => ollama.deleteModel(model));
  ipcMain.handle("models:system", () => modelCatalog.systemInfo());
  ipcMain.handle("models:catalog", async () => {
    modelCatalog.preloadRemote();
    return modelCatalog.popularCatalog();
  });
  ipcMain.handle("models:search", async (_e, query: string, installedOnly?: boolean) => {
    return modelCatalog.searchCatalog(query || "", { installedOnly: !!installedOnly });
  });

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
    let custom: string | null = null;
    if (data?.folderPath) custom = String(data.folderPath);
    else if (data?.folderBase) custom = projectFiles.childPath(data.folderBase, project.name);
    projectFiles.ensureFolder(project, custom);
    try {
      analytics.trackProjectCreated();
    } catch {
      // never throw into IPC callers
    }
    return store.get(project.id);
  });
  ipcMain.handle("projects:update", (_e, { id, patch }) => {
    const updated = store.update(id, patch);
    if (updated) {
      try {
        analytics.trackProjectUpdated({ title: updated.name });
      } catch {
        // never throw into IPC callers
      }
    }
    return updated;
  });
  ipcMain.handle("projects:setDefaultUseTools", (_e, { id, enabled }) =>
    store.setDefaultUseTools(id, !!enabled)
  );
  ipcMain.handle("projects:delete", (_e, id) => {
    // Drop the project's context chunks and shared memory from Chroma.
    context.removeProject(id).catch(() => {});
    memory.forget(id).catch(() => {});
    const removed = store.remove(id);
    if (removed) {
      try {
        analytics.trackProjectDeleted();
      } catch {
        // never throw into IPC callers
      }
    }
    return removed;
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
  ipcMain.handle("graph:summary", (_e, projectId) => graph.summary(projectId || ""));
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
  ipcMain.handle("pfiles:open", async (_e, { dir, name }) => {
    const result = await projectFiles.openGenerated(dir, name);
    try {
      analytics.trackFileOpened({ source: "generated", feature: "viewer" });
    } catch {
      // never throw into IPC callers
    }
    return result;
  });
  ipcMain.handle("pfiles:apps-for", (_e, { dir, name }) => openWith.appsFor(dir, name));
  ipcMain.handle("pfiles:open-with", (_e, { dir, name, appId }) =>
    openWith.openWith(dir, name, appId)
  );
  ipcMain.handle("pfiles:exists", (_e, { dir, name }) => projectFiles.existsGenerated(dir, name));
  ipcMain.handle("pfiles:set-location", (_e, { projectId, dir }) =>
    projectFiles.ensureFolder(store.get(projectId), dir)
  );

  // Artifacts: list roots/files and gated delete (open/reveal via pfiles:open/show)
  ipcMain.handle("artifacts:list-roots", () => {
    const generatedDir = fallbackDir();
    const projects = store.list().map((s) => {
      const p = store.get(s.id);
      return { id: s.id, name: s.name, folderPath: p?.folderPath ?? "" };
    });
    return artifacts.listArtifactRoots(projects, generatedDir);
  });
  ipcMain.handle("artifacts:list-files", (_e, dir: string) => {
    const generatedDir = fallbackDir();
    const projects = store.list().map((s) => {
      const p = store.get(s.id);
      return { id: s.id, name: s.name, folderPath: p?.folderPath ?? "" };
    });
    const roots = artifacts.artifactAllowedRoots(projects, generatedDir);
    return artifacts.listArtifactFiles(dir, roots);
  });
  ipcMain.handle("artifacts:delete", (_e, { dir, name }: { dir: string; name: string }) => {
    const generatedDir = fallbackDir();
    const projects = store.list().map((s) => {
      const p = store.get(s.id);
      return { id: s.id, name: s.name, folderPath: p?.folderPath ?? "" };
    });
    const roots = artifacts.artifactAllowedRoots(projects, generatedDir);
    return artifacts.deleteArtifact(dir, name, roots);
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
  ipcMain.handle("chats:create", (_e, data) => {
    const chat = chats.create(data);
    try {
      const title =
        (data && typeof data === "object" && (data.title || data.name)) || undefined;
      analytics.trackChatCreated({
        title: typeof title === "string" ? title : undefined,
      });
    } catch {
      // never throw into IPC callers
    }
    return chat;
  });
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
  ipcMain.on("chat:start", async (
    event,
    { id, projectId, threadId, model, messages, useTools, skillOverrides }
  ) => {
    const send = (channel, payload) => {
      if (!event.sender.isDestroyed()) event.sender.send(channel, payload);
    };
    const thought = createThoughtTimer();
    const act = (event: ActivityEvent) => activitySend(send, id, event);
    let toolsRun = 0;
    let activityStarted = false;
    let thinkingOpen = false;
    const endThinking = () => {
      if (!thinkingOpen) return;
      thinkingOpen = false;
      const ms = thought.end();
      act({ kind: "thinking", phase: "end", ms });
    };
    const chatStartedAt = Date.now();
    try {
      const project = store.get(projectId);
      const useModel = model || (project && project.model);
      if (!useModel) throw new Error("No model selected");

      try {
        analytics.trackAiRequestStarted({ model: useModel });
      } catch {
        // never throw into chat flow
      }

      const lastUser = [...messages].reverse().find((m) => m.role === "user");
      const extras = Array.isArray(skillOverrides) ? skillOverrides.filter(Boolean) : [];
      const derived = conversationAttachments(messages);

      // --- Governance: pre-flight limits/budget/rate/model, then content. ---
      const warnings = [];
      const pre = await governance.preflight(useModel, estimateTokens(messages));
      if (pre.warnings) warnings.push(...pre.warnings);
      if (!pre.allowed) throw new Error(pre.reason || "Blocked by organization policy.");
      if (lastUser) {
        const verdict = await governance.evaluatePrompt(lastUser.content);
        // Track after governance so text is redacted; omit text on blocked path.
        try {
          analytics.trackMessage({
            direction: "sent",
            role: "user",
            model: useModel,
            ...(verdict.blocked ? {} : { text: verdict.text }),
            title: project?.name,
          });
        } catch {
          // never throw into chat flow
        }
        if (verdict.blocked) throw new Error(verdict.reason);
        warnings.push(...verdict.warnings);
        lastUser.content = verdict.text; // may be redacted
      }
      for (const d of derived.docs) {
        const v = await governance.evaluatePrompt(d.text || "");
        if (v.blocked) throw new Error(`${v.reason} (attachment "${d.name}")`);
        warnings.push(...v.warnings);
        d.text = v.text;
      }
      if (warnings.length) send("chat:governance", { id, warnings });

      // Project-first coding: coding intent + tools on → ensure workspace,
      // docs lookup, suppress streamed source, finish with a file/command summary.
      const projectCoding =
        !!useTools && !!lastUser && isProjectCodingIntent(lastUser.content);
      let projectCodingDocsNote: string | null = null;
      const projectCodingOutcomes: ToolOutcome[] = [];

      const blocks = [];
      // Also collected into `toolInstructionBlocks` (below) so multi-agent
      // tool workers (workers.ts) see the same context the single-agent
      // loop does — declared up front since the attached-document block
      // needs to land in both.
      const toolInstructionBlocks = [];

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

      // Attached documents become a per-turn context block. Also pushed into
      // toolInstructionBlocks: without this, a multi-agent tool worker
      // asked to "summarize this document" has no way to see the document
      // text at all (it only gets step.goal), and produces a confidently
      // wrong answer instead of using the attachment.
      if (derived.docs.length) {
        const docsBlock = derived.docs
          .map((d) => `Attached document "${d.name}":\n${d.text}`)
          .join("\n\n");
        blocks.push(docsBlock);
        toolInstructionBlocks.push(docsBlock);
      }

      // Enabled skills add their usage instructions when tools are on. Also
      // collected into `toolInstructionBlocks` so the multi-agent tool
      // worker (workers.ts) gets the same tool-usage guidance the
      // single-agent loop does — not just the tool definitions themselves.
      if (useTools) {
        if (projectCoding) {
          act({ kind: "status", text: "Setting up project" });
          const ensured = workspace.ensureAutoProject(lastUser.content);
          if (ensured.created) {
            act({ kind: "status", text: `Created project folder: ${ensured.root}` });
            send("workspace:changed", { root: ensured.root });
          }
          act({ kind: "status", text: "Looking up docs" });
          const docs = await lookupCodingDocs({
            text: lastUser.content,
            search: (q) => webSearch.search(q),
          });
          projectCodingDocsNote = docs.note;
          if (docs.block) {
            blocks.push(docs.block);
            toolInstructionBlocks.push(docs.block);
          }
          const pf = projectFirstPromptBlock();
          blocks.push(pf);
          toolInstructionBlocks.push(pf);
        }
        const follow = followUpPromptBlock();
        if (follow) {
          blocks.push(follow);
          toolInstructionBlocks.push(follow);
        }
        const skillBlock = skillsRegistry.instructionsBlock(extras);
        if (skillBlock) {
          blocks.push(skillBlock);
          toolInstructionBlocks.push(skillBlock);
        }
        // Working folder: tells the model where file tools operate.
        // Re-read after project-coding ensure so the new root is included.
        const wsBlock = workspace.promptBlock();
        if (wsBlock) {
          blocks.push(wsBlock);
          toolInstructionBlocks.push(wsBlock);
        }
        // "Create a PDF" etc: nudge the model to call generate_document
        // instead of pasting the document into its reply.
        if (lastUser) {
          const wantedFormat = documentIntent.detect(lastUser.content);
          if (wantedFormat) {
            const docBlock = documentIntent.promptBlock(wantedFormat);
            blocks.push(docBlock);
            toolInstructionBlocks.push(docBlock);
          }
        }
      }

      // Personal context the user set in Customize, applied to every chat.
      const userBlock = userContext.promptBlock();
      if (userBlock) blocks.push(userBlock);

      const system = blocks.join("\n\n---\n\n");
      const full = [];
      if (system) full.push({ role: "system", content: system });
      for (const m of messages) {
        if (m.role === "system" || m.role === "user" || m.role === "assistant" || m.role === "tool") {
          full.push(m);
        }
      }

      // Attach images to the latest user message (vision models).
      if (derived.images.length) {
        for (let i = full.length - 1; i >= 0; i--) {
          if (full[i].role === "user") {
            full[i] = { ...full[i], images: derived.images };
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
        const fromSkills = skillsRegistry
          .ollamaTools(extras)
          .filter((d) => !seen.has(d.function.name));
        toolDefs = [...base, ...fromSkills];
        skillToolAllow = skillsRegistry.customToolNames(extras);
      }
      activityStarted = true;

      const confirm = (tool, args) =>
        new Promise((resolve) => {
          const token = Math.random().toString(36).slice(2);
          pendingConfirms.set(token, { resolve, id });
          act({
            kind: "confirm",
            token,
            label: labelFor(tool.name),
            tool: { name: tool.name, description: tool.description },
            args,
          });
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
      const ask = (payload) =>
        new Promise((resolve) => {
          const token = Math.random().toString(36).slice(2);
          pendingAsks.set(token, { resolve, id });
          act({ kind: "status", text: "Waiting for your answer…" });
          act({ kind: "ask", token, question: payload.question, options: payload.options || [] });
          send("chat:ask", { id, token, ...payload });
        });

      // Shared turn-completion logic — meter usage, tell the renderer the
      // turn is done, and persist the exchange. Used by both the
      // multi-agent orchestrator's success path and the single-agent loop
      // below, so the two paths behave identically once a final answer
      // exists.
      const agentCfg = resolveAgentSettings(settings.read());
      const lp = agentCfg.loadProtection;
      let stopReason: "memory" | undefined;
      let stopKillPercent: number | undefined;
      let sampleFailedLogged = false;

      const sampleOrNull = (): number | null => {
        if (!lp.enabled) return null;
        const pct = systemRamUsedPercent();
        if (pct == null && !sampleFailedLogged) {
          sampleFailedLogged = true;
          console.warn("[load-guard] system RAM sample failed; failing open");
        }
        return pct;
      };

      const tripSoftStop = (pct: number) => {
        cancelledChats.add(id);
        rejectPendingForChat(id);
        stopReason = "memory";
        stopKillPercent = lp.killPercent;
        void pct;
      };

      const finishTurn = async (
        text: string,
        totalPrompt: number,
        totalCompletion: number,
        stopped: boolean
      ) => {
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
        {
          const thoughtMs = thought.totalMs();
          act({ kind: "done", thoughtMs, toolCount: toolsRun, summary: summaryOf(thoughtMs, toolsRun) });
        }
        const promptTokens = totalPrompt || estimateTokens(full);
        const completionTokens = totalCompletion || Math.round(text.length / 4);
        send("chat:done", {
          id,
          full: text,
          stopped,
          ...(stopped && stopReason === "memory"
            ? { stopReason: "memory", killPercent: stopKillPercent ?? lp.killPercent }
            : {}),
          usage: {
            tokens,
            ctx,
            percent,
            promptTokens,
            completionTokens,
            measured: !!(totalPrompt || totalCompletion), // real Ollama counts vs ~4 chars/token estimate
          },
        });

        try {
          analytics.trackMessage({
            direction: "received",
            role: "assistant",
            model: useModel,
            text,
            prompt_tokens: promptTokens,
            completion_tokens: completionTokens,
          });
          analytics.trackAiRequestCompleted({
            model: useModel,
            duration_bucket: analytics.durationBucket(Date.now() - chatStartedAt),
            prompt_tokens: promptTokens,
            completion_tokens: completionTokens,
          });
        } catch {
          // never throw into chat flow
        }

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
      };

      // Soft-stop before classify / plan / model work when already over kill %.
      let multiPromptTokens = 0;
      let multiCompletionTokens = 0;
      if (lp.enabled) {
        const pct = sampleOrNull();
        if (isOverKillLimit(pct, lp.killPercent)) {
          tripSoftStop(pct as number);
          await finishTurn("", multiPromptTokens, multiCompletionTokens, true);
          return;
        }
      }

      const monitor = createInFlightMonitor({
        enabled: lp.enabled,
        killPercent: lp.killPercent,
        sample: sampleOrNull,
        onTrip: () => {
          const pct = sampleOrNull();
          tripSoftStop(pct ?? lp.killPercent);
        },
      });
      monitor.start();
      try {
      // --- Multi-agent gate --------------------------------------------
      // Cheap heuristic first (leanComplexity, no model call); an LLM
      // classify only runs for the ambiguous middle ground. Simple turns
      // and agents.enabled === false always stay on the single-agent path
      // below. A planner fallback (fellBack) also falls through below.
      //
      // `multiPromptTokens`/`multiCompletionTokens` accumulate every model
      // call the gate/orchestrator makes on this turn — classify, planTurn
      // (including its repair retry), every worker tool-loop round, and the
      // final synthesis — so metering doesn't silently drop the cost of the
      // heaviest-usage turns. They're added into whichever path's
      // `finishTurn` call ends up happening, single or multi, since a
      // classify() call can run even when the turn ultimately falls back.
      const trackedGenerate = async (genModel: string, prompt: string): Promise<string> => {
        const r = await ollama.generateWithUsage(genModel, prompt);
        multiPromptTokens += r.promptTokens || 0;
        multiCompletionTokens += r.completionTokens || 0;
        return r.text;
      };

      const lastText = (lastUser && lastUser.content) || "";
      let useMulti = false;
      if (agentCfg.enabled && lastText) {
        const lean = leanComplexity({
          text: lastText,
          useTools: !!useTools,
          hasProject: !!project,
          hasAttachments: !!(derived.docs.length || derived.images.length),
        });
        if (lean === "complex") {
          useMulti = true;
        } else if (lean === "ambiguous") {
          try {
            const mode = await classifyComplexity({
              model: modelForRole(agentCfg, "router", useModel),
              text: lastText,
              preferMulti: !!useTools || !!project,
              generate: trackedGenerate,
            });
            useMulti = mode === "multi";
          } catch {
            useMulti = !!useTools || !!project;
          }
        }
      }
      // Project-coding owns scaffolding via the single-agent tool loop
      // (avoids parallel tool waves dumping code via synthesize).
      if (projectCoding) useMulti = false;

      if (useMulti) {
        act({ kind: "status", text: "Planning…" });
        const runStep = makeWorkers({
          project,
          threadId,
          toolModel: modelForRole(agentCfg, "toolExecutor", useModel),
          modelForKind: (kind) => modelForStepKind(agentCfg, kind, useModel),
          toolDefs,
          skillToolAllow,
          toolSystemPrompt: toolInstructionBlocks.length ? toolInstructionBlocks.join("\n\n---\n\n") : null,
          confirm,
          ask,
          act,
          onFile: (file) => send("chat:file", { id, ...file }),
          onToolCall: () => {
            toolsRun += 1;
          },
          isCancelled: () => cancelledChats.has(id),
        });

        // Note: a thrown planTurn (Ollama down, missing model, etc.) is
        // soft-failed to fellBack *inside* runOrchestratedTurn (see
        // orchestrator.ts), not caught here. Catching broadly at this call
        // site would also swallow a failure from `synthesize` — which can
        // run after tool steps already had real side effects (sent an
        // email, created a calendar event) — and falling back to the
        // single-agent loop at that point would re-run the model and risk
        // re-executing those same tools. So only the planning phase soft-
        // fails; a post-planning throw here is a genuine error and should
        // surface as chat:error like any other mid-turn failure.
        const orchResult = await runOrchestratedTurn(lastText, {
          maxParallel: agentCfg.maxParallel,
          beforeWave: () => {
            if (!lp.enabled) {
              return { maxParallel: agentCfg.maxParallel, softStop: false };
            }
            const pct = sampleOrNull();
            const over = isOverKillLimit(pct, lp.killPercent);
            if (over) tripSoftStop(pct as number);
            return {
              maxParallel: effectiveMaxParallel(agentCfg.maxParallel, {
                enabled: true,
                overKill: over,
              }),
              softStop: over,
            };
          },
          planTurn: () =>
            planTurn({
              model: modelForRole(agentCfg, "planner", useModel),
              userText: lastText,
              preferentialKnowledge: isPreferentialKnowledge(lastText),
              generate: trackedGenerate,
            }),
          assignKinds,
          runStep,
          synthesize: async (_ctx, results) => {
            for (const r of results) {
              multiPromptTokens += r.promptTokens || 0;
              multiCompletionTokens += r.completionTokens || 0;
            }
            const notes = results
              .map(
                (r, i) =>
                  `Worker ${i + 1} (${r.ok ? "ok" : "error"}): ${r.output || r.error || "(no output)"}`
              )
              .join("\n\n");
            const synthMessages = [
              ...full,
              {
                role: "system",
                content:
                  `Findings gathered by worker agents for this turn:\n\n${notes}\n\n` +
                  `Use these findings to write the final reply to the user. Do not mention ` +
                  `that the work was delegated to worker agents.\n\n` +
                  `If any worker reported disputed or unknown claims, surface that uncertainty clearly in the final reply. Do not invent citations.`,
              },
            ];
            thought.start();
            thinkingOpen = true;
            act({ kind: "thinking", phase: "start" });
            let wroteStatus = false;
            let sawReasoning = false;
            const onPiece = (piece: { content?: string; thinking?: string }) => {
              if (piece.thinking && !sawReasoning) {
                sawReasoning = true;
                endThinking();
                act({ kind: "status", text: "Reasoning…" });
              }
              if (piece.content) {
                if (!wroteStatus) {
                  wroteStatus = true;
                  endThinking();
                  act({ kind: "status", text: "Writing reply…" });
                }
                send("chat:chunk", { id, text: piece.content });
              }
            };
            const synthModel = modelForRole(agentCfg, "synthesize", useModel);
            const r = await ollama.chatStream(synthModel, synthMessages, onPiece);
            endThinking();
            multiPromptTokens += r.promptTokens || 0;
            multiCompletionTokens += r.completionTokens || 0;
            return r.text || "";
          },
          act,
          isCancelled: () => cancelledChats.has(id),
        });

        if (!orchResult.fellBack) {
          // isCancelled() returning true mid-run short-circuits the
          // orchestrator with fellBack:false and empty text — treat that
          // the same way the single-agent loop treats a stop request.
          const wasCancelled = cancelledChats.has(id);
          if (wasCancelled) cancelledChats.delete(id);
          await finishTurn(orchResult.text, multiPromptTokens, multiCompletionTokens, wasCancelled);
          return;
        }
        act({ kind: "status", text: "Falling back to standard chat…" });
      }

      let result;
      let totalPrompt = 0;
      let totalCompletion = 0;
      let rounds = 0;
      let stopped = false;
      for (;;) {
        if (cancelledChats.has(id)) {
          cancelledChats.delete(id);
          stopped = true;
          break;
        }
        thought.start();
        thinkingOpen = true;
        act({ kind: "thinking", phase: "start" });
        if (rounds > 0) act({ kind: "status", text: "Continuing with tool results…" });
        let wroteStatus = false;
        let sawReasoning = false;
        const useThink = modelSupportsThink(useModel);
        const onPiece = (piece: { content?: string; thinking?: string }) => {
          if (piece.thinking && !sawReasoning) {
            sawReasoning = true;
            endThinking();
            act({ kind: "status", text: "Reasoning…" });
          }
          if (piece.content) {
            if (!wroteStatus) {
              wroteStatus = true;
              endThinking();
              act({ kind: "status", text: projectCoding ? "Generating code" : "Writing reply…" });
            }
            if (!projectCoding) {
              send("chat:chunk", { id, text: piece.content });
            }
          }
        };
        try {
          result = await ollama.chatStream(
            useModel,
            full,
            onPiece,
            toolDefs,
            null,
            undefined,
            useThink || undefined
          );
        } catch (e) {
          if (!useThink || wroteStatus || sawReasoning) throw e;
          result = await ollama.chatStream(useModel, full, onPiece, toolDefs);
        }
        endThinking();
        totalPrompt += result.promptTokens || 0;
        totalCompletion += result.completionTokens || 0;
        let calls = result.toolCalls || [];
        // Small models often paste tool JSON in the reply instead of emitting
        // structured tool_calls — recover those so http_fetch / etc. actually run.
        if (toolDefs && !calls.length && result.text) {
          const allowed = toolDefs.map((d) => d.function.name);
          const recovered = recoverToolCalls(result.text, allowed);
          if (recovered.calls.length) {
            calls = recovered.calls;
            result = { ...result, text: recovered.cleanedText };
            // Strip the recovered JSON from the visible/persisted reply too,
            // not just the model-facing history — the renderer keeps its own
            // accumulated text independent of `result.text`.
            send("chat:replace", { id, text: recovered.cleanedText });
          }
        }
        // Folder organizing / coding tasks need more tool rounds than Q&A.
        if (!toolDefs || !calls.length || rounds >= 15) break;
        rounds += 1;
        act({ kind: "status", text: `Running ${calls.length} tool${calls.length === 1 ? "" : "s"}…` });
        full.push({ role: "assistant", content: result.text, tool_calls: calls });
        for (const call of calls) {
          const fname = call.function?.name || "";
          const fargs = call.function?.arguments || {};
          const label = labelFor(fname);
          const detail = detailFor(fname, fargs);
          act({
            kind: "tool",
            name: fname,
            label,
            detail,
            args: fargs,
            status: "running",
          });
          // Connector-skill tools (gcal_*, outlook_*) run through the skills
          // executor; everything else goes to the plain tools executor.
          const output = skillsExec.owns(fname)
            ? await skillsExec.execute(fname, fargs, confirm)
            : await toolsExec.execute(fname, fargs, confirm, skillToolAllow, {
                projectId: project ? project.id : null,
                // Generated documents surface as a clickable file card in the chat.
                onFile: (file) => send("chat:file", { id, ...file }),
                ask,
              });
          toolsRun += 1;
          act({
            kind: "tool",
            name: fname,
            label,
            detail,
            args: fargs,
            status: "done",
            output: String(output).slice(0, 400),
          });
          projectCodingOutcomes.push({
            name: fname,
            args: (fargs && typeof fargs === "object" ? fargs : {}) as Record<string, unknown>,
            output: String(output),
            denied: /^denied|user denied|not approved/i.test(String(output)),
          });
          if (projectCoding && fname === "run_shell") {
            act({ kind: "status", text: "Using terminal" });
          }
          if (projectCoding && (fname === "write_file" || fname === "create_directory")) {
            act({ kind: "status", text: "Generating code" });
          }
          full.push({ role: "tool", content: String(output), tool_name: fname });
        }
      }
      let text = (result && result.text) || "";
      // Stop mid-turn: still summarize whatever tools already landed.
      if (projectCoding && (!stopped || projectCodingOutcomes.length)) {
        act({ kind: "status", text: "Writing summary" });
        text = buildProjectSummary({
          root: workspace.get() || "",
          outcomes: projectCodingOutcomes,
          docsNote: projectCodingDocsNote,
          modelText: text,
        });
        send("chat:replace", { id, text });
      }
      // Include any gate-level generate() cost (e.g. an ambiguous-turn
      // classify() call that ended up choosing single-agent) so it isn't
      // dropped just because the turn didn't go multi-agent.
      await finishTurn(text, multiPromptTokens + totalPrompt, multiCompletionTokens + totalCompletion, stopped);
      } finally {
        monitor.stop();
      }
    } catch (e) {
      if (activityStarted) {
        // Close an open thinking span before done so Task 5 ticker is not stuck.
        endThinking();
        const thoughtMs = thought.totalMs();
        act({ kind: "done", thoughtMs, toolCount: toolsRun, summary: summaryOf(thoughtMs, toolsRun) });
      }
      try {
        analytics.trackAiRequestFailed({ error_type: coarseChatErrorCode(e) });
      } catch {
        // never throw into chat flow
      }
      send("chat:error", { id, error: e.message });
    }
  });
}

function summaryOf(thoughtMs: number, toolCount: number): string {
  const thought = thoughtMs < 1500 ? "Thought briefly" : `Thought for ${Math.round(thoughtMs / 1000)}s`;
  if (!toolCount) return thought;
  return `${thought} · ${toolCount} tool${toolCount === 1 ? "" : "s"}`;
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

