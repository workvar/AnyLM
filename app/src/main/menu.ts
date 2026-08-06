// Application menu. Without an explicit menu the dev build shows "Electron"
// as the first menu title, because macOS takes that name from the running
// bundle rather than from app.setName().
import { app, Menu, shell, BrowserWindow } from "electron";

const isMac = process.platform === "darwin";

function send(channel: string): void {
  const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
  if (win && !win.isDestroyed()) win.webContents.send(channel, {});
}

function build(): Menu {
  const name = app.getName();
  const template: Electron.MenuItemConstructorOptions[] = [];

  if (isMac) {
    template.push({
      label: name,
      submenu: [
        { role: "about", label: `About ${name}` },
        { type: "separator" },
        {
          label: "Settings…",
          accelerator: "Cmd+,",
          click: () => send("menu:settings"),
        },
        {
          label: "Customize…",
          click: () => send("menu:customize"),
        },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide", label: `Hide ${name}` },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit", label: `Quit ${name}` },
      ],
    });
  }

  template.push({
    label: "File",
    submenu: [
      { label: "New Chat", accelerator: "CmdOrCtrl+N", click: () => send("menu:new-chat") },
      { label: "New Project", accelerator: "CmdOrCtrl+Shift+N", click: () => send("menu:new-project") },
      { type: "separator" },
      { label: "Search", accelerator: "CmdOrCtrl+F", click: () => send("menu:search") },
      { type: "separator" },
      isMac ? { role: "close" } : { role: "quit" },
    ],
  });

  template.push({
    label: "Edit",
    submenu: [
      { role: "undo" },
      { role: "redo" },
      { type: "separator" },
      { role: "cut" },
      { role: "copy" },
      { role: "paste" },
      { role: "selectAll" },
    ],
  });

  template.push({
    label: "View",
    submenu: [
      { label: "Toggle Sidebar", accelerator: "CmdOrCtrl+B", click: () => send("menu:sidebar") },
      { label: "Toggle Context Panel", accelerator: "CmdOrCtrl+Shift+B", click: () => send("menu:rail") },
      { type: "separator" },
      { role: "resetZoom" },
      { role: "zoomIn" },
      { role: "zoomOut" },
      { type: "separator" },
      { role: "togglefullscreen" },
      { role: "toggleDevTools" },
    ],
  });

  template.push({
    role: "window",
    submenu: isMac
      ? [{ role: "minimize" }, { role: "zoom" }, { type: "separator" }, { role: "front" }]
      : [{ role: "minimize" }, { role: "close" }],
  });

  template.push({
    role: "help",
    submenu: [
      {
        label: `${name} on GitHub`,
        click: () => shell.openExternal("https://github.com/workvar/AnyLM"),
      },
      { label: "Check for Updates…", click: () => send("menu:check-updates") },
    ],
  });

  return Menu.buildFromTemplate(template);
}

function install(): void {
  Menu.setApplicationMenu(build());
}

export { install };
