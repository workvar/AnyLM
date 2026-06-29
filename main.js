const { app, BrowserWindow, session } = require("electron");
const path = require("path");
const { registerIpc } = require("./src/main/ipc");
const { registerProtocol } = require("./src/main/protocol");
const updater = require("./src/main/updater");
const macUI = require("./src/main/mac-ui");

// Claim the llmeter:// scheme and single-instance lock before anything else.
registerProtocol();

function createWindow() {
  const win = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 900,
    minHeight: 600,
    title: "LLMeter",
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
  // Allow the camera (attach > Camera); deny other permission requests.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) =>
    cb(permission === "media")
  );
  registerIpc();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
