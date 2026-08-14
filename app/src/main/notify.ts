// System notifications, gated by the user's Settings toggles.
import { app, Notification, nativeImage } from "electron";
import * as path from "path";
import * as settings from "./settings";
import { focusWindow } from "./window";

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

// Notifications that ask for input are useless if they cannot get the user
// back to the chat, so a click raises the window (see ./window).

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

