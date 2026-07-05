// User settings persisted as JSON in Electron's userData dir.
// checkUpdatesOnLaunch is null until the first-launch prompt is answered.
const { app } = require("electron");
const fs = require("fs");
const path = require("path");

const DEFAULTS = {
  theme: "system",
  checkUpdatesOnLaunch: null,
  sidebarCollapsed: false,
  // Last model the user picked in a chat; new chats default to it.
  lastModel: "",
  // ChromaDB server (vector store / memory backend). Runs locally like Ollama.
  chromaHost: "localhost",
  chromaPort: 8000,
  chromaSsl: false,
  // null = not yet asked; true = user declined the embed-model install prompt.
  embedInstallDeclined: null,
  // System notifications (managed in Settings).
  notifyUsage: true, // approaching / exceeded token limits
  notifyRenewals: true, // allowance period renewed
  notifyReports: true, // scheduled report ready
  // Scheduled usage reports: off | daily | weekly | monthly
  reportFrequency: "off",
  lastReportAt: null,
  // Internal: last alert level per org so we don't re-notify (see scheduler).
  govAlerts: {},
};

function filePath() {
  return path.join(app.getPath("userData"), "llmeter-settings.json");
}

function read() {
  try {
    return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(filePath(), "utf8")) };
  } catch {
    return { ...DEFAULTS };
  }
}

function write(patch) {
  const next = { ...read(), ...patch };
  fs.writeFileSync(filePath(), JSON.stringify(next, null, 2));
  return next;
}

module.exports = { read, write };
