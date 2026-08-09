// Update state machine. Downloads come from GitHub Releases only (no app store).
//
// Flow: check -> "available" (user is asked) -> download (background, progress
// with speed/ETA streamed to the renderer) -> "ready" (restart now, or let it
// install silently on quit).
import { app } from "electron";
import * as analytics from "../analytics";
import * as settings from "../settings";
import * as feed from "./feed";
import * as notes from "./notes";
import { createTracker } from "./progress";

const tracker = createTracker();

let send: (channel: string, payload: unknown) => void = () => {};
let wired = false;
let cancelToken = null;
let pending = null; // { version, notes } for the update being handled

function emit(state, extra = {}) {
  send("update:status", { state, ...extra });
}

function isCancelled(err: unknown): boolean {
  const message = String((err && (err as Error).message) || err);
  return /cancell?ed/i.test(message);
}

/** Coarse reliability events — never throws into updater flow. */
function trackUpdater(event: string, properties?: Record<string, unknown>): void {
  try {
    analytics.capture({ event, category: "reliability", properties });
  } catch {
    // never throw into updater flow
  }
}

function trackUpdaterError(): void {
  trackUpdater("updater_error", { error_type: "updater_error" });
}

function wire() {
  if (wired) return feed.get();
  wired = true;
  return feed.wire({
    onChecking: () => {
      trackUpdater("updater_check");
      emit("checking");
    },

    onAvailable: (info) => {
      pending = { version: info.version, notes: notes.normalize(info.releaseNotes) };
      // Honor the user's "download automatically" preference: no prompt, the
      // renderer just shows the collapsed progress pill.
      if (settings.read().autoDownloadUpdates === true) {
        emit("available", { ...pending, auto: true });
        download({ auto: true });
        return;
      }
      emit("available", pending);
    },

    onUpToDate: () => emit("up-to-date"),

    onProgress: (p) => emit("downloading", { ...pending, ...tracker.sample(p) }),

    onDownloaded: (info) => {
      cancelToken = null;
      // Download already tracked at download() start. updater_install is only
      // emitted from install() / quitAndInstall — not on download-complete.
      emit("ready", {
        version: info.version,
        notes: notes.normalize(info.releaseNotes),
        installOnQuit: settings.read().installUpdatesOnQuit !== false,
      });
    },

    onError: (err) => {
      cancelToken = null;
      // A user-initiated cancel surfaces as an error; report it as a cancel.
      const message = String((err && (err as Error).message) || err);
      if (isCancelled(err)) return emit("cancelled");
      trackUpdaterError();
      emit("error", { message });
    },
  });
}

// Push user preferences into electron-updater. Safe to call at any time; a
// no-op in dev, where electron-updater is never loaded.
function applyPreferences() {
  if (!app.isPackaged || !wired) return;
  feed.setInstallOnQuit(settings.read().installUpdatesOnQuit !== false);
}

async function check() {
  if (!app.isPackaged) return emit("dev");
  try {
    wire();
    applyPreferences();
    await feed.get().checkForUpdates();
  } catch (err) {
    if (!isCancelled(err)) trackUpdaterError();
    emit("error", { message: String((err && (err as Error).message) || err) });
  }
}

async function download({ auto = false } = {}) {
  if (!app.isPackaged || cancelToken) return;
  try {
    trackUpdater("updater_download");
    tracker.reset();
    emit("downloading", {
      ...pending,
      auto,
      percent: 0,
      transferred: 0,
      total: 0,
      bytesPerSecond: 0,
      etaSeconds: null,
    });
    cancelToken = feed.newCancellationToken();
    await wire().downloadUpdate(cancelToken);
  } catch (err) {
    cancelToken = null;
    const message = String((err && (err as Error).message) || err);
    if (isCancelled(err)) return emit("cancelled");
    trackUpdaterError();
    emit("error", { message });
  }
}

function cancel() {
  if (!cancelToken) return;
  try {
    cancelToken.cancel();
  } catch {}
  cancelToken = null;
  emit("cancelled");
}

// Quit and install the staged update now.
function install() {
  if (!app.isPackaged) return;
  trackUpdater("updater_install");
  feed.get().quitAndInstall();
}

// Bind the channel used to push status to the renderer.
function init(sender) {
  send = sender;
}

export { init, check, download, cancel, install, applyPreferences };

