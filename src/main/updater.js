// Auto-update via electron-updater. The feed lives on Cloudflare R2 (configured
// as a generic provider at build time), so no token ships in the app.
// We drive download/install from the UI, so autoDownload is off.
const { app } = require("electron");

let updater = null;
let send = () => {};

// Forward updater lifecycle to the renderer as { state, ... } messages.
function emit(state, extra = {}) {
  send("update:status", { state, ...extra });
}

function load() {
  if (updater) return updater;
  // Lazy require: electron-updater pulls native-ish deps and only works packaged.
  ({ autoUpdater: updater } = require("electron-updater"));
  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = true;

  updater.on("checking-for-update", () => emit("checking"));
  updater.on("update-available", (info) => emit("available", { version: info.version }));
  updater.on("update-not-available", () => emit("up-to-date"));
  updater.on("error", (err) => emit("error", { message: String(err && err.message) }));
  updater.on("download-progress", (p) => emit("downloading", { percent: Math.round(p.percent) }));
  updater.on("update-downloaded", (info) => emit("ready", { version: info.version }));
  return updater;
}

// Bind the channel used to push status to the renderer.
function init(sender) {
  send = sender;
}

async function check() {
  if (!app.isPackaged) {
    emit("dev");
    return;
  }
  try {
    await load().checkForUpdates();
  } catch (err) {
    emit("error", { message: String(err && err.message) });
  }
}

async function download() {
  if (!app.isPackaged) return;
  try {
    await load().downloadUpdate();
  } catch (err) {
    emit("error", { message: String(err && err.message) });
  }
}

// Quit and install the staged update.
function install() {
  if (!app.isPackaged) return;
  load().quitAndInstall();
}

module.exports = { init, check, download, install };
