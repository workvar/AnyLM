// System notifications, gated by the user's Settings toggles.
const { Notification } = require("electron");
const settings = require("./settings");

// kind: "usage" | "renewal" | "report" — maps to a settings toggle.
const TOGGLES = { usage: "notifyUsage", renewal: "notifyRenewals", report: "notifyReports" };

function send(kind, title, body) {
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

module.exports = { send };
