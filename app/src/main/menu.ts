// Application menu. Without patching Electron.app's Info.plist the macOS
// menu bar still shows "Electron" in unpackaged runs (see
// scripts/fix-electron-bundle.js); app.setName() alone is not enough.
import { app, Menu, shell, BrowserWindow } from "electron";
import { PRODUCT_NAME, productDisplayName } from "./product";

const isMac = process.platform === "darwin";

type MenuContext = {
  projectId?: string | null;
  projectName?: string | null;
};

let context: MenuContext = {};

function send(action: string, payload: Record<string, unknown> = {}): void {
  const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
  if (win && !win.isDestroyed()) win.webContents.send("menu:action", { action, ...payload });
}

function build(): Menu {
  const name = productDisplayName(app.isPackaged);
  const packaged = app.isPackaged;
  const projectName = (context.projectName || "").trim();
  const hasProject = !!(context.projectId && projectName);
  const template: Electron.MenuItemConstructorOptions[] = [];

  if (isMac) {
    template.push({
      label: name,
      submenu: [
        { role: "about", label: `About ${name}` },
        { type: "separator" },
        {
          label: "Settings…",
          accelerator: "CmdOrCtrl+,",
          click: () => send("settings"),
        },
        {
          label: "Models",
          click: () => send("settings-section", { section: "models" }),
        },
        {
          label: "Organization",
          click: () => send("settings-section", { section: "org" }),
        },
        {
          label: "Tools",
          click: () => send("settings-section", { section: "tools" }),
        },
        {
          label: "Skills",
          click: () => send("settings-section", { section: "skills" }),
        },
        {
          label: "Customize…",
          click: () => send("settings-section", { section: "customize" }),
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

  const fileSubmenu: Electron.MenuItemConstructorOptions[] = [
    { label: "New Chat", accelerator: "CmdOrCtrl+N", click: () => send("new-chat") },
    {
      label: hasProject ? `New Chat in ${projectName}` : "New Chat in Project",
      accelerator: "CmdOrCtrl+Shift+T",
      enabled: hasProject,
      click: () => send("new-project-chat"),
    },
    {
      label: "New Project",
      accelerator: "CmdOrCtrl+Shift+N",
      click: () => send("new-project"),
    },
    { type: "separator" },
    {
      label: "Search Chats…",
      accelerator: "CmdOrCtrl+F",
      click: () => send("search"),
    },
  ];

  if (!isMac) {
    fileSubmenu.push(
      { type: "separator" },
      {
        label: "Settings…",
        accelerator: "CmdOrCtrl+,",
        click: () => send("settings"),
      },
      {
        label: "Customize…",
        click: () => send("settings-section", { section: "customize" }),
      }
    );
  }

  fileSubmenu.push({ type: "separator" }, isMac ? { role: "close" } : { role: "quit" });
  template.push({ label: "File", submenu: fileSubmenu });

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

  const viewSubmenu: Electron.MenuItemConstructorOptions[] = [
    { label: "Toggle Sidebar", accelerator: "CmdOrCtrl+B", click: () => send("sidebar") },
    {
      label: "Toggle Context Panel",
      accelerator: "CmdOrCtrl+Shift+B",
      click: () => send("rail"),
    },
    { type: "separator" },
    { role: "resetZoom" },
    { role: "zoomIn" },
    { role: "zoomOut" },
    { type: "separator" },
    { role: "togglefullscreen" },
  ];
  if (!packaged) {
    viewSubmenu.push({ role: "toggleDevTools" });
  }
  template.push({ label: "View", submenu: viewSubmenu });

  template.push({
    role: "window",
    submenu: isMac
      ? [{ role: "minimize" }, { role: "zoom" }, { type: "separator" }, { role: "front" }]
      : [{ role: "minimize" }, { role: "close" }],
  });

  const helpSubmenu: Electron.MenuItemConstructorOptions[] = [
    {
      label: `${PRODUCT_NAME} on GitHub`,
      click: () => shell.openExternal("https://github.com/workvar/AnyLM"),
    },
  ];
  if (packaged) {
    helpSubmenu.push({ label: "Check for Updates…", click: () => send("check-updates") });
  }
  template.push({ role: "help", submenu: helpSubmenu });

  return Menu.buildFromTemplate(template);
}

function install(): void {
  Menu.setApplicationMenu(build());
}

function setContext(next: MenuContext = {}): void {
  context = {
    projectId: next.projectId || null,
    projectName: next.projectName || null,
  };
  install();
}

export { install, setContext };
