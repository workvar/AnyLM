import { app, BrowserWindow, session, shell } from "electron";
import * as path from "path";
import { registerIpc } from "./src/main/ipc";
import { registerProtocol } from "./src/main/protocol";
import * as updater from "./src/main/updater";
import * as macUI from "./src/main/mac-ui";
import * as chromaServer from "./src/main/chroma-server";
import * as proxy from "./src/main/proxy/server";
import * as settings from "./src/main/settings";
import * as startupDeps from "./src/main/startup-deps";
import * as appMenu from "./src/main/menu";
import * as analytics from "./src/main/analytics";
import { PRODUCT_NAME, productDisplayName } from "./src/main/product";

// Force the app name everywhere (menu bar, dock, About) — without this the dev
// build shows "Electron". Packaged builds also pick this up via productName.
// Pin userData to the brand name BEFORE setName: app.setName() would otherwise
// relocate userData to a path derived from the display name (e.g. "AnyLM
// (Dev)"), splitting dev/packaged data instead of sharing ~/Library/Application
// Support/AnyLM.
const displayName = productDisplayName(app.isPackaged);
app.setPath("userData", path.join(app.getPath("appData"), PRODUCT_NAME));
app.setName(displayName);

// This file is compiled to dist/main.js, so __dirname is <app>/dist. The icon
// is not compiled and stays at <app>/build; the renderer is emitted next to
// us at dist/renderer by tsconfig.renderer.json.
const APP_ROOT = path.join(__dirname, "..");
const APP_ICON = path.join(APP_ROOT, "build", "icon.png");
const RENDERER_HTML = path.join(__dirname, "renderer", "index.html");
const PRELOAD = path.join(__dirname, "preload.js");

// Claim the anylm:// scheme and single-instance lock before anything else.
registerProtocol();

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 900,
    minHeight: 600,
    title: displayName,
    icon: APP_ICON,
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
    },
    ...macUI.windowOptions(),
  });
  // index.html has a static <title>, which would otherwise make Electron
  // overwrite our displayName (e.g. "AnyLM (Dev)") once the page loads.
  win.on("page-title-updated", (event) => {
    event.preventDefault();
  });
  // Links in chat and in the activity trail carry target="_blank". Without
  // this they would open a bare, chrome-less Electron window; send them to the
  // user's real browser instead, and never let the app frame itself navigate.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (url !== win.webContents.getURL()) {
      event.preventDefault();
      if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    }
  });
  win.loadFile(RENDERER_HTML);

  // macOS 26+: apply the native Liquid Glass view (no-op elsewhere).
  macUI.applyGlass(win);

  // Route updater status to this window's renderer.
  updater.init((channel: string, payload: unknown) => {
    if (!win.isDestroyed()) win.webContents.send(channel, payload);
  });
}

app.whenReady().then(async () => {
  // Dock icon for the dev build (packaged builds use the bundled .icns).
  if (process.platform === "darwin" && app.dock) {
    try {
      app.dock.setIcon(APP_ICON);
    } catch {}
  }
  // Name + icon in the About panel, and an app menu titled "AnyLM" rather
  // than "Electron" (the default menu takes its title from the bundle).
  app.setAboutPanelOptions({
    applicationName: displayName,
    applicationVersion: app.getVersion(),
    iconPath: APP_ICON,
    credits: "A local-first LLM workspace.",
  });
  appMenu.install();
  // Allow the camera (attach > Camera); deny other permission requests.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) =>
    cb(permission === "media")
  );
  // Verify bundled backends (Chroma + graph store) and probe Ollama before UI.
  await startupDeps.ensureReady();
  const cfg = settings.read();
  if (cfg.proxyEnabled) proxy.start(cfg.proxyPort);
  registerIpc();
  createWindow();
  analytics.init();
  analytics.trackAppOpened();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// Flush analytics on quit: preventDefault once, await shutdown (≤2s), then exit.
// Flag avoids infinite will-quit ↔ preventDefault loops when app.exit() re-enters.
let analyticsQuitHandled = false;
app.on("will-quit", (event) => {
  if (analyticsQuitHandled) return;
  analyticsQuitHandled = true;
  event.preventDefault();

  void (async () => {
    try {
      analytics.trackAppClosed();
    } catch {
      // best-effort
    }
    try {
      await Promise.race([
        analytics.shutdown(),
        new Promise<void>((resolve) => setTimeout(resolve, 2000)),
      ]);
    } catch {
      // best-effort
    }
    chromaServer.stop();
    proxy.stop();
    app.exit(0);
  })();
});
