// System notifications, gated by the user's Settings toggles.
import { Notification } from "electron";
import * as settings from "./settings";

// kind: "usage" | "renewal" | "report" — maps to a settings toggle.
const TOGGLES: Record<string, keyof AppSettings> = { usage: "notifyUsage", renewal: "notifyRenewals", report: "notifyReports" };

function send(kind: "usage" | "renewal" | "report", title: string, body: string): boolean {
  const s = settings.read();
  const key = TOGGLES[kind];
  if (key && s[key] === false) return false;
  if (!Notification.isSupported()) return false;
  try {
    new Notification({ title, body, silent: false }).show();
    return true;
  } catch {
    return false;
  }
}

export { send };

