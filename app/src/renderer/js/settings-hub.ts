// Settings hub: left-nav shell that swaps General / Privacy / Models / Org /
// Tools / Skills / Customize panels inside #settings-view.
import { el, qsa } from "./dom.js";
import { state } from "./state.js";
import { showView } from "./nav.js";
import { loadProjects } from "./projects.js";
import { openModelsView } from "./models.js";
import { openOrgView } from "./org.js";
import { openToolsView } from "./tools-view.js";
import { openSkillsView } from "./skills-view.js";
import { paintCustomize } from "./customize.js";
import { paintPrivacySettings } from "./privacy-settings.js";
import { refreshSettingsGeneral } from "./settings.js";

export type SettingsSection =
  | "general"
  | "privacy"
  | "models"
  | "org"
  | "tools"
  | "skills"
  | "customize";

const SECTIONS: SettingsSection[] = [
  "general",
  "privacy",
  "models",
  "org",
  "tools",
  "skills",
  "customize",
];

const PANEL_IDS: Record<SettingsSection, string> = {
  general: "settings-panel-general",
  privacy: "settings-panel-privacy",
  models: "models-view",
  org: "org-view",
  tools: "tools-view",
  skills: "skills-view",
  customize: "settings-panel-customize",
};

function normalize(section?: string): SettingsSection {
  return SECTIONS.includes(section as SettingsSection) ? (section as SettingsSection) : "general";
}

export function openSettingsHub(section: SettingsSection | string = "general") {
  showView("settings");
  selectSettingsSection(section);
}

/** Menu / programmatic entry for Customize (Settings hub only). */
export function openCustomize() {
  openSettingsHub("customize");
}

export function selectSettingsSection(section: SettingsSection | string = "general") {
  const s = normalize(section);
  state.settingsSection = s;

  for (const btn of qsa("#settings-nav button[data-settings]")) {
    btn.classList.toggle("active", btn.dataset.settings === s);
  }
  for (const [key, id] of Object.entries(PANEL_IDS) as Array<[SettingsSection, string]>) {
    const node = el(id);
    if (node) node.classList.toggle("hidden", key !== s);
  }

  if (s === "general") refreshSettingsGeneral();
  else if (s === "privacy") void paintPrivacySettings();
  else if (s === "models") openModelsView();
  else if (s === "org") openOrgView();
  else if (s === "tools") openToolsView();
  else if (s === "skills") openSkillsView();
  else if (s === "customize") paintCustomize();
}

function backToHome() {
  showView("projects");
  loadProjects();
}

export function initSettingsHub() {
  el("open-settings").onclick = () => openSettingsHub("general");
  el("settings-back").onclick = backToHome;
  for (const btn of qsa("#settings-nav button[data-settings]")) {
    btn.onclick = () => selectSettingsSection(btn.dataset.settings || "general");
  }
}
