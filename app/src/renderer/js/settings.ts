// General settings panel: theme, updates, notifications, knowledge, agents.
import { el, qsa } from "./dom.js";
import { applyTheme } from "./theme.js";
import { checkNow } from "./updates/index.js";

let settings: AppSettings = { theme: "system", checkUpdatesOnLaunch: null } as AppSettings;

const AGENT_MODEL_SELECTS: { id: string; key: keyof AgentModelMap }[] = [
  { id: "agents-model-planner", key: "planner" },
  { id: "agents-model-router", key: "router" },
  { id: "agents-model-tool", key: "toolExecutor" },
  { id: "agents-model-synth", key: "synthesize" },
];

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

function fillModelSelect(selectId: string, models: string[], selected: string | null) {
  const select = el(selectId);
  select.replaceChildren();
  const defaultOpt = document.createElement("option");
  defaultOpt.value = "";
  defaultOpt.textContent = "Same as chat";
  select.appendChild(defaultOpt);
  for (const m of models) {
    const opt = document.createElement("option");
    opt.value = m;
    opt.textContent = m;
    select.appendChild(opt);
  }
  select.value = selected ?? "";
}

async function populateAgentModelSelects() {
  let models: string[] = [];
  try {
    models = await window.api.listModels();
  } catch (e) {
    console.error("Failed to load models for agents settings:", e);
  }
  const agentModels = settings.agents?.models;
  for (const { id, key } of AGENT_MODEL_SELECTS) {
    fillModelSelect(id, models, agentModels?.[key] ?? null);
  }
}

function paintAgentsSettings() {
  const agents = settings.agents;
  el("agents-enabled").checked = agents?.enabled !== false;
  el("agents-max-parallel").value = String(agents?.maxParallel ?? 2);
  for (const { id, key } of AGENT_MODEL_SELECTS) {
    el(id).value = agents?.models?.[key] ?? "";
  }
}

/** Re-paint general panel values when the hub opens that section. */
export function refreshSettingsGeneral() {
  refreshKnowledge();
  void populateAgentModelSelects();
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

  el("agents-enabled").onchange = (e) =>
    save({ agents: { enabled: (e.target as UiElement).checked } });
  el("agents-max-parallel").onchange = (e) =>
    save({ agents: { maxParallel: Number((e.target as UiElement).value) } });
  for (const { id, key } of AGENT_MODEL_SELECTS) {
    el(id).onchange = (e) => {
      const v = (e.target as UiElement).value;
      save({ agents: { models: { [key]: v || null } } });
    };
  }
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
  paintAgentsSettings();
  await populateAgentModelSelects();
  el("settings-version").textContent = `AnyLM v${await window.api.getVersion()}`;
  bind();
  return settings;
}
