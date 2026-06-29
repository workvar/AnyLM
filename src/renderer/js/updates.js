// Update banner state machine + first-launch opt-in.
import { el, node } from "./dom.js";

// Quiet states only surface when the user explicitly asked (manual check).
const QUIET = new Set(["checking", "up-to-date", "dev"]);
let manual = false;

function hide() {
  el("update-banner").classList.add("hidden");
}

function setActions(buttons) {
  const wrap = el("up-actions");
  wrap.innerHTML = "";
  for (const b of buttons) {
    const btn = node("button", b.primary ? "primary small" : "ghost small", b.label);
    btn.onclick = b.onClick;
    wrap.appendChild(btn);
  }
}

function show({ title, msg = "", percent = null, actions = [] }) {
  el("up-title").textContent = title;
  el("up-msg").textContent = msg;
  el("up-progress").classList.toggle("hidden", percent === null);
  if (percent !== null) el("up-bar").style.width = `${percent}%`;
  setActions(actions);
  el("update-banner").classList.remove("hidden");
}

function render(s) {
  if (QUIET.has(s.state) && !manual) return hide();
  switch (s.state) {
    case "checking":
      return show({ title: "Checking for updates…" });
    case "up-to-date":
      manual = false;
      return show({ title: "You're up to date", actions: [{ label: "Dismiss", onClick: hide }] });
    case "dev":
      manual = false;
      return show({
        title: "Updates unavailable in dev",
        msg: "Run an installed build to test updates.",
        actions: [{ label: "Dismiss", onClick: hide }],
      });
    case "available":
      return show({
        title: "Update available",
        msg: `Version ${s.version} is ready to download.`,
        actions: [
          { label: "Later", onClick: hide },
          { label: "Download", primary: true, onClick: () => window.api.downloadUpdate() },
        ],
      });
    case "downloading":
      return show({ title: "Downloading update", msg: `${s.percent}%`, percent: s.percent });
    case "ready":
      manual = false;
      return show({
        title: "Update ready",
        msg: `Restart to install version ${s.version}.`,
        actions: [
          { label: "Later", onClick: hide },
          { label: "Restart now", primary: true, onClick: () => window.api.installUpdate() },
        ],
      });
    case "error":
      manual = false;
      return show({
        title: "Update error",
        msg: s.message || "Something went wrong.",
        actions: [{ label: "Dismiss", onClick: hide }],
      });
  }
}

export function checkNow() {
  manual = true;
  window.api.checkForUpdate();
}

export function initUpdates() {
  window.api.onUpdateStatus(render);
}

// First launch: ask once. Otherwise honor the saved preference.
export function runLaunchUpdateFlow(settings) {
  if (settings.checkUpdatesOnLaunch === null) {
    el("first-run").classList.remove("hidden");
    el("fr-no").onclick = async () => {
      el("first-run").classList.add("hidden");
      await window.api.setSettings({ checkUpdatesOnLaunch: false });
    };
    el("fr-yes").onclick = async () => {
      el("first-run").classList.add("hidden");
      await window.api.setSettings({ checkUpdatesOnLaunch: true });
      window.api.checkForUpdate();
    };
    return;
  }
  if (settings.checkUpdatesOnLaunch === true) window.api.checkForUpdate();
}
