// Settings modal: theme choice, update-on-launch toggle, manual check, version.
import { el } from "./dom.js";
import { applyTheme } from "./theme.js";
import { checkNow } from "./updates.js";

let settings = { theme: "system", checkUpdatesOnLaunch: null };

function paintThemeSeg() {
  for (const b of document.querySelectorAll("#theme-seg button")) {
    b.classList.toggle("active", b.dataset.themeChoice === settings.theme);
  }
}

async function save(patch) {
  settings = await window.api.setSettings(patch);
}

async function refreshKnowledge() {
  const n = await window.api.knowledgeCount();
  el("knowledge-count").textContent = `${n} chunk${n === 1 ? "" : "s"} stored`;
}

function open() {
  el("settings-modal").classList.remove("hidden");
  refreshKnowledge();
}
function close() {
  el("settings-modal").classList.add("hidden");
}

function bind() {
  el("open-settings").onclick = open;
  el("settings-close").onclick = close;
  el("settings-modal").onclick = (e) => {
    if (e.target.id === "settings-modal") close();
  };

  for (const b of document.querySelectorAll("#theme-seg button")) {
    b.onclick = async () => {
      const theme = b.dataset.themeChoice;
      applyTheme(theme);
      await save({ theme });
      paintThemeSeg();
    };
  }

  el("update-toggle").onchange = (e) => save({ checkUpdatesOnLaunch: e.target.checked });
  el("notify-usage").onchange = (e) => save({ notifyUsage: e.target.checked });
  el("notify-renewals").onchange = (e) => save({ notifyRenewals: e.target.checked });
  el("report-frequency").onchange = (e) => save({ reportFrequency: e.target.value });
  el("check-now").onclick = () => checkNow();
  el("knowledge-clear").onclick = async () => {
    await window.api.knowledgeClear();
    await refreshKnowledge();
  };
}

// Load settings, apply theme, and reflect values in the UI.
export async function initSettings() {
  settings = await window.api.getSettings();
  applyTheme(settings.theme);
  paintThemeSeg();
  el("update-toggle").checked = settings.checkUpdatesOnLaunch === true;
  el("notify-usage").checked = settings.notifyUsage !== false;
  el("notify-renewals").checked = settings.notifyRenewals !== false;
  el("report-frequency").value = settings.reportFrequency || "off";
  el("settings-version").textContent = `AnyLM v${await window.api.getVersion()}`;
  bind();
  return settings;
}
