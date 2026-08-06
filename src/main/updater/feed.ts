// Lazy access to electron-updater. The feed is a GitHub Releases feed configured
// at build time (see build.publish in package.json), so no token ships in the app
// and there is no app-store dependency.
//
// Kept separate from index.js so the state machine there stays readable, and so
// electron-updater is only required when an update is actually attempted (it
// misbehaves in unpackaged dev builds).

// `import type` costs nothing at runtime, so the module stays lazily loaded
// while the require() below is still fully typed.
import type { AppUpdater } from "electron-updater";

type ElectronUpdater = typeof import("electron-updater");

let cached: AppUpdater | null = null;

function get(): AppUpdater {
  if (cached) return cached;
  const { autoUpdater } = require("electron-updater") as ElectronUpdater;
  // We drive download and install from the UI, so never auto-download.
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;
  // Windows: take the full NSIS installer from the release, not a web installer,
  // so the "install silently on quit" path has the bytes it needs.
  if (process.platform === "win32") (autoUpdater as any).disableWebInstaller = true;
  cached = autoUpdater;
  return cached;
}

// A fresh token per download so a cancelled attempt can't abort the next one.
function newCancellationToken() {
  const { CancellationToken } = require("electron-updater") as ElectronUpdater;
  return new CancellationToken();
}

interface FeedHandlers {
  onChecking: (...args: any[]) => void;
  onAvailable: (...args: any[]) => void;
  onUpToDate: (...args: any[]) => void;
  onProgress: (...args: any[]) => void;
  onDownloaded: (...args: any[]) => void;
  onError: (...args: any[]) => void;
}

// Attach lifecycle listeners once. `handlers` receives already-normalized data.
function wire(handlers: FeedHandlers): AppUpdater {
  const u = get();
  u.on("checking-for-update", handlers.onChecking);
  u.on("update-available", handlers.onAvailable);
  u.on("update-not-available", handlers.onUpToDate);
  u.on("download-progress", handlers.onProgress);
  u.on("update-downloaded", handlers.onDownloaded);
  u.on("error", handlers.onError);
  return u;
}

function setInstallOnQuit(enabled: boolean) {
  get().autoInstallOnAppQuit = enabled !== false;
}

export { get, wire, newCancellationToken, setInstallOnQuit };

