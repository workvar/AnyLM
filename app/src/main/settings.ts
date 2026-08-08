// User settings persisted as JSON in Electron's userData dir.
// checkUpdatesOnLaunch is null until the first-launch prompt is answered.
import { app } from "electron";
import * as fs from "fs";
import * as path from "path";
import { clampMaxParallel } from "./agents/max-parallel";
import { env } from "./env";

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
  // ChromaDB server (vector store / memory backend). Runs locally like Ollama.
  chromaHost: "localhost",
  chromaPort: 8000,
  chromaSsl: false,
  ollamaSetupDeclined: null, // null = not declined; true = Later forever
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
    },
  },
};

function filePath(): string {
  return path.join(app.getPath("userData"), "llmeter-settings.json");
}

function read(): AppSettings {
  try {
    const saved = JSON.parse(fs.readFileSync(filePath(), "utf8")) as Partial<AppSettings>;
    return { ...DEFAULTS, ...saved };
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
    };
  }
  fs.writeFileSync(filePath(), JSON.stringify(next, null, 2));
  return next;
}

export { read, write };

