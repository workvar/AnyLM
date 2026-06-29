// User settings persisted as JSON in Electron's userData dir.
// checkUpdatesOnLaunch is null until the first-launch prompt is answered.
const { app } = require("electron");
const fs = require("fs");
const path = require("path");

const DEFAULTS = { theme: "system", checkUpdatesOnLaunch: null, sidebarCollapsed: false };

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
