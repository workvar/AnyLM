const { app, BrowserWindow, session } = require("electron");
const path = require("path");
const { registerIpc } = require("./src/main/ipc");
const { registerProtocol } = require("./src/main/protocol");
const updater = require("./src/main/updater");
const macUI = require("./src/main/mac-ui");
const chromaServer = require("./src/main/chroma-server");

// Force the app name everywhere (menu bar, dock, About) — without this the dev
// build shows "Electron". Packaged builds also pick this up via productName.
app.setName("AnyLM");

const APP_ICON = path.join(__dirname, "build/icon.png");

// Claim the anylm:// scheme and single-instance lock before anything else.
registerProtocol();

function createWindow() {
  const win = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 900,
    minHeight: 600,
    title: "AnyLM",
    icon: APP_ICON,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    ...macUI.windowOptions(),
  });
  win.loadFile(path.join(__dirname, "src/renderer/index.html"));

  // macOS 26+: apply the native Liquid Glass view (no-op elsewhere).
  macUI.applyGlass(win);

  // Route updater status to this window's renderer.
  updater.init((channel, payload) => {
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
  registerIpc();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// Shut the bundled Chroma server down with the app.
app.on("will-quit", () => chromaServer.stop());
