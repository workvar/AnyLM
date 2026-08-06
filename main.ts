import { app, BrowserWindow, session } from "electron";
import * as path from "path";
import { registerIpc } from "./src/main/ipc";
import { registerProtocol } from "./src/main/protocol";
import * as updater from "./src/main/updater";
import * as macUI from "./src/main/mac-ui";
import * as chromaServer from "./src/main/chroma-server";
import * as proxy from "./src/main/proxy/server";
import * as settings from "./src/main/settings";

// Force the app name everywhere (menu bar, dock, About) — without this the dev
// build shows "Electron". Packaged builds also pick this up via productName.
app.setName("AnyLM");

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
    title: "AnyLM",
    icon: APP_ICON,
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
    },
    ...macUI.windowOptions(),
  });
  win.loadFile(RENDERER_HTML);

  // macOS 26+: apply the native Liquid Glass view (no-op elsewhere).
  macUI.applyGlass(win);

  // Route updater status to this window's renderer.
  updater.init((channel: string, payload: unknown) => {
    if (!win.isDestroyed()) win.webContents.send(channel, payload);
  });
}

app.whenReady().then(() => {
  // Dock icon for the dev build (packaged builds use the bundled .icns).
  if (process.platform === "darwin" && app.dock) {
    try {
      app.dock.setIcon(APP_ICON);
    } catch {}
  }
  // Allow the camera (attach > Camera); deny other permission requests.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) =>
    cb(permission === "media")
  );
  // Start the bundled Chroma server (context + memory backend). Fire-and-forget:
  // the app stays usable while it comes up, and fails soft if it can't.
  chromaServer.start();
  // Serve the OpenAI-compatible endpoint for other local apps. Fire-and-
  // forget for the same reason as Chroma: the app is fully usable without it.
  const cfg = settings.read();
  if (cfg.proxyEnabled) proxy.start(cfg.proxyPort);
  registerIpc();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// Shut the bundled Chroma server and the local proxy down with the app.
app.on("will-quit", () => {
  chromaServer.stop();
  proxy.stop();
});
