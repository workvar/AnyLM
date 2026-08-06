// System notifications, gated by the user's Settings toggles.
import { app, Notification, BrowserWindow, nativeImage } from "electron";
import * as path from "path";
import * as settings from "./settings";

type Kind = "usage" | "renewal" | "report" | "attention";

// kind → the settings toggle that silences it.
const TOGGLES: Record<Kind, keyof AppSettings> = {
  usage: "notifyUsage",
  renewal: "notifyRenewals",
  report: "notifyReports",
  attention: "notifyInterventions",
};

let icon: Electron.NativeImage | null = null;
function appIcon(): Electron.NativeImage | undefined {
  if (!icon) {
    icon = nativeImage.createFromPath(path.join(app.getAppPath(), "build", "icon.png"));
  }
  return icon.isEmpty() ? undefined : icon;
}

// Bring the window forward when a notification is clicked. Notifications that
// ask for input are useless if they cannot get the user back to the chat.
function focusWindow(): void {
  const win = BrowserWindow.getAllWindows()[0];
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function send(kind: Kind, title: string, body: string): boolean {
  const s = settings.read();
  const key = TOGGLES[kind];
  if (key && s[key] === false) return false;
  if (!Notification.isSupported()) return false;
  try {
    const n = new Notification({ title, body, icon: appIcon(), silent: false });
    n.on("click", focusWindow);
    n.show();
    return true;
  } catch {
    return false;
  }
}

export { send };

