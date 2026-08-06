// General settings panel: theme, updates, notifications, knowledge.
import { el, qsa } from "./dom.js";
import { applyTheme } from "./theme.js";
import { checkNow } from "./updates/index.js";

let settings: AppSettings = { theme: "system", checkUpdatesOnLaunch: null } as AppSettings;

function paintThemeSeg() {
  for (const b of qsa("#theme-seg button")) {
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

/** Re-paint general panel values when the hub opens that section. */
export function refreshSettingsGeneral() {
  refreshKnowledge();
}

function bind() {
  for (const b of qsa("#theme-seg button")) {
    b.onclick = async () => {
      const theme = b.dataset.themeChoice;
      applyTheme(theme);
      await save({ theme });
      paintThemeSeg();
    };
  }

  el("update-toggle").onchange = (e) => save({ checkUpdatesOnLaunch: (e.target as UiElement).checked });
  el("auto-download-toggle").onchange = (e) => save({ autoDownloadUpdates: (e.target as UiElement).checked });
  el("install-on-quit-toggle").onchange = (e) => save({ installUpdatesOnQuit: (e.target as UiElement).checked });
  el("notify-usage").onchange = (e) => save({ notifyUsage: (e.target as UiElement).checked });
  el("notify-renewals").onchange = (e) => save({ notifyRenewals: (e.target as UiElement).checked });
  const notifyInterventions = el("notify-interventions");
  if (notifyInterventions) {
    notifyInterventions.onchange = (e) =>
      save({ notifyInterventions: (e.target as UiElement).checked });
  }
  el("report-frequency").onchange = (e) => save({ reportFrequency: (e.target as UiElement).value });
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
  el("auto-download-toggle").checked = settings.autoDownloadUpdates === true;
  el("install-on-quit-toggle").checked = settings.installUpdatesOnQuit !== false;
  el("notify-usage").checked = settings.notifyUsage !== false;
  el("notify-renewals").checked = settings.notifyRenewals !== false;
  const notifyInterventions = el("notify-interventions");
  if (notifyInterventions) {
    notifyInterventions.checked = settings.notifyInterventions !== false;
  }
  el("report-frequency").value = settings.reportFrequency || "off";
  el("settings-version").textContent = `AnyLM v${await window.api.getVersion()}`;
  bind();
  return settings;
}
