// User settings persisted as JSON in Electron's userData dir.
// checkUpdatesOnLaunch is null until the first-launch prompt is answered.
import { app } from "electron";
import * as fs from "fs";
import * as path from "path";
import { clampTruncateChars } from "./analytics/clamp";
import { clampMaxParallel } from "./agents/max-parallel";
import { env } from "./env";
import { clampKillPercent } from "./load-guard/clamp";

const DEFAULTS: AppSettings = {
  theme: "system",
  checkUpdatesOnLaunch: null,
  // Skip the "an update is available" prompt and fetch it in the background.
  autoDownloadUpdates: false,
  // Apply a downloaded update silently the next time the app quits.
  installUpdatesOnQuit: true,
  sidebarCollapsed: false,
  railCollapsed: false,
  // Last model the user picked in a chat; new chats default to it.
  lastModel: "",
  // Tools are on by default; see main/use-tools.ts.
  defaultUseToolsForChats: true,
  // ChromaDB server (vector store / memory backend). Runs locally like Ollama.
  chromaHost: "localhost",
  chromaPort: 8000,
  chromaSsl: false,
  ollamaSetupDeclined: null, // null = not declined; true = Later forever
  setupWizardCompleted: null, // null = show first-run setup wizard
  // null = not yet asked; true = user declined the embed-model install prompt.
  embedInstallDeclined: null,
  // System notifications (managed in Settings).
  notifyUsage: true, // approaching / exceeded token limits
  notifyRenewals: true, // allowance period renewed
  notifyReports: true, // scheduled report ready
  notifyInterventions: true, // a chat is waiting on the user's answer
  // Scheduled usage reports: off | daily | weekly | monthly
  reportFrequency: "off",
  lastReportAt: null,
  // Internal: last alert level per org so we don't re-notify (see scheduler).
  govAlerts: {},
  // Local OpenAI-compatible endpoint other apps can point at. This used to
  // live in the separate backend process; it now runs inside the app, so it
  // needs its own on/off switch.
  proxyEnabled: true,
  // Build default from app/.env; the user's saved value overrides it.
  proxyPort: env.proxyPort,
  // Customize: personal context prepended to every chat (see user-context.ts).
  userContext: { enabled: true, name: "", about: "", work: "", style: "", extra: "" },
  agents: {
    enabled: true,
    maxParallel: 2,
    models: {
      planner: null,
      router: null,
      toolExecutor: null,
      synthesize: null,
      research: null,
      factCheck: null,
      summarize: null,
      document: null,
    },
    loadProtection: {
      enabled: true,
      killPercent: 90,
    },
  },
  analyticsConsent: null,
  analytics: {
    productUsage: true,
    reliability: true,
    chatEvents: true,
    titles: true,
    modelAndTokens: true,
    truncatedMessageText: false,
    truncateChars: 200,
  },
};

function filePath(): string {
  return path.join(app.getPath("userData"), "llmeter-settings.json");
}

function mergeSettings(saved: Partial<AppSettings>): AppSettings {
  const merged: AppSettings = { ...DEFAULTS, ...saved };
  // Deep-merge agents so older settings files still get loadProtection defaults.
  if (saved.agents) {
    merged.agents = {
      ...DEFAULTS.agents,
      ...saved.agents,
      models: { ...DEFAULTS.agents.models, ...(saved.agents.models || {}) },
      loadProtection: {
        ...DEFAULTS.agents.loadProtection,
        ...(saved.agents.loadProtection || {}),
      },
    };
  }
  if (saved.analytics) {
    merged.analytics = {
      ...DEFAULTS.analytics,
      ...saved.analytics,
      truncateChars: clampTruncateChars(saved.analytics.truncateChars),
    };
  }
  return merged;
}

function read(): AppSettings {
  try {
    const saved = JSON.parse(fs.readFileSync(filePath(), "utf8")) as Partial<AppSettings>;
    return mergeSettings(saved);
  } catch {
    return { ...DEFAULTS };
  }
}

function write(patch: Partial<AppSettings>): AppSettings {
  const prev = read();
  const next: AppSettings = { ...prev, ...patch };
  if (patch.agents) {
    next.agents = {
      ...prev.agents,
      ...patch.agents,
      models: { ...prev.agents.models, ...(patch.agents.models || {}) },
      maxParallel: clampMaxParallel(patch.agents.maxParallel ?? prev.agents.maxParallel),
      loadProtection: {
        ...prev.agents.loadProtection,
        ...(patch.agents.loadProtection || {}),
        enabled:
          (patch.agents.loadProtection?.enabled ?? prev.agents.loadProtection?.enabled) !== false,
        killPercent: clampKillPercent(
          patch.agents.loadProtection?.killPercent ?? prev.agents.loadProtection?.killPercent
        ),
      },
    };
  }
  if (patch.analytics) {
    next.analytics = {
      ...prev.analytics,
      ...patch.analytics,
      truncateChars: clampTruncateChars(
        patch.analytics.truncateChars ?? prev.analytics.truncateChars
      ),
    };
  }
  fs.writeFileSync(filePath(), JSON.stringify(next, null, 2));
  return next;
}

export { mergeSettings, read, write };

