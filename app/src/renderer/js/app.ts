// App bootstrap: status, navigation, conversation wiring, and event binding.
import { el, qsa } from "./dom.js";
import { state } from "./state.js";
import {
  loadProjects,
  renderGrid,
  createProject,
  openProject,
  scheduleProjectName,
  scheduleInstructions,
  saveProjectModel,
  toggleProjectLock,
  openProjectSettings,
  initProjectSettingsTabs,
  saveKnowledgeFlow,
  addContextFile,
  newFolder,
  initNewProjectModal,
  changeProjectLocation,
  revealProjectFolder,
} from "./projects.js";
import { initDetailTabs, initFileViewer } from "./project-files.js";
import { createChat, saveChatModel, scheduleChatName } from "./chats.js";
import { createProjectThread, scheduleThreadName } from "./threads.js";
import { loadRecents } from "./recents.js";
import { showView } from "./nav.js";
import { initPrompt } from "./prompt.js";
import { sendMessage, initToolUse } from "./chat.js";
import { initTools } from "./tools-view.js";
import { initSkills } from "./skills-view.js";
import { initAuth } from "./auth.js";
import { initSettings } from "./settings.js";
import { initUpdates, runLaunchUpdateFlow } from "./updates/index.js";
import { initEmbedModel, runEmbedLaunchFlow } from "./embedmodel.js";
import { initModelDropdown } from "./dropdown.js";
import { initAttach } from "./attach.js";
import { initWorkspace } from "./workspace.js";
import { updateDraft } from "./contextmeter.js";
import { bindEvents as bindModelEvents } from "./models.js";
import { compactConversation } from "./compact.js";
import { initOrg } from "./org.js";
import { initTurns } from "./turns.js";
import { initWorkingStrip } from "./working-strip.js";
import { initRail } from "./rail/index.js";
import { toggleOrgShare, toggleAutoLog } from "./projects.js";
import { initSidebar } from "./sidebar/index.js";
import { initCustomize } from "./customize.js";
import { initSettingsHub } from "./settings-hub.js";
import { initWebResearchHint } from "./web-research-hint.js";
import { initOllamaSetup, runOllamaLaunchFlow } from "./ollama-setup.js";

async function refreshStatus() {
  const s = await window.api.ollamaStatus();
  const dot = el("status-dot");
  dot.classList.toggle("on", s.ok);
  dot.classList.toggle("off", !s.ok);
  el("ollama-info").textContent = s.ok
    ? `Ollama connected (${s.host})`
    : `Ollama offline. Start it, then reopen.`;
  if (s.ok) {
    try {
      state.models = await window.api.listModels();
    } catch {
      state.models = [];
    }
  }
}

// Memory backend (Chroma) status dot + label. Returns whether it's reachable.
async function refreshChromaStatus() {
  try {
    const cs = await window.api.chromaStatus();
    const dot = el("chroma-dot");
    dot.classList.toggle("on", cs.ok);
    dot.classList.toggle("off", !cs.ok);
    el("chroma-info").textContent = cs.ok ? `Memory ready (${cs.host})` : "Memory starting…";
    return cs.ok;
  } catch {
    return false;
  }
}

// The bundled server takes a moment to boot; poll until ready (or give up).
function pollChromaUntilReady() {
  let tries = 0;
  const iv = setInterval(async () => {
    tries += 1;
    const ok = await refreshChromaStatus();
    if (ok || tries >= 20) clearInterval(iv);
  }, 1500);
}

function toggleSidebar() {
  const collapsed = el("app").classList.toggle("sidebar-collapsed");
  window.api.setSettings({ sidebarCollapsed: collapsed });
}

function closeModal(id) {
  el(id).classList.add("hidden");
}

// Back out of an open conversation to where it came from.
function convoBack() {
  if (state.mode === "project" && state.viewProject) openProject(state.viewProject.id);
  else openProjectsGrid();
}

function openProjectsGrid() {
  showView("projects");
  loadProjects();
}

function bindClick(id: string, handler: (this: UiElement, ev: MouseEvent) => void) {
  const node = el(id);
  if (node) node.onclick = handler;
}

function bindEvents() {
  // Sidebar
  bindClick("new-chat-btn", createChat);
  bindClick("projects-nav", openProjectsGrid);
  bindClick("sidebar-toggle", toggleSidebar);
  bindClick("sidebar-toggle-projects", toggleSidebar);
  bindClick("sidebar-toggle-detail", toggleSidebar);
  bindClick("sidebar-toggle-models", toggleSidebar);
  bindClick("sidebar-toggle-org", toggleSidebar);
  bindClick("sidebar-toggle-tools", toggleSidebar);
  bindClick("sidebar-toggle-skills", toggleSidebar);
  bindClick("sidebar-toggle-settings", toggleSidebar);
  bindClick("sidebar-toggle-customize", toggleSidebar);

  // Projects grid controls
  el("new-project-btn").onclick = createProject;
  el("projects-search").oninput = (e) => {
    state.projectQuery = (e.target as UiElement).value;
    renderGrid();
  };
  for (const b of qsa("#projects-sort button")) {
    b.onclick = () => {
      state.projectSort = b.dataset.sort;
      for (const x of qsa("#projects-sort button"))
        x.classList.toggle("active", x === b);
      renderGrid();
    };
  }
  el("show-archived").onchange = (e) => {
    state.showArchived = (e.target as UiElement).checked;
    renderGrid();
  };

  // Project detail
  initDetailTabs();
  initFileViewer();
  el("detail-back").onclick = openProjectsGrid;
  el("detail-manage").onclick = openProjectSettings;
  el("detail-new-folder").onclick = newFolder;
  el("detail-new-chat").onclick = createProjectThread;

  // Conversation
  el("convo-back").onclick = convoBack;
  el("convo-name").oninput = () =>
    state.mode === "project" ? scheduleThreadName() : scheduleChatName();
  initModelDropdown(() =>
    state.mode === "project" ? saveProjectModel() : saveChatModel()
  );
  initAttach();
  initWorkspace();

  // Project settings modal
  initProjectSettingsTabs();
  el("project-modal-close").onclick = () => closeModal("project-modal");
  el("project-modal").onclick = (e) => {
    if ((e.target as UiElement).id === "project-modal") closeModal("project-modal");
  };
  el("project-name-input").oninput = scheduleProjectName;
  el("instructions").oninput = scheduleInstructions;
  el("model-lock").onchange = (e) => toggleProjectLock((e.target as UiElement).checked);
  el("org-share").onchange = (e) => toggleOrgShare((e.target as UiElement).checked);
  el("auto-log").onchange = (e) => toggleAutoLog((e.target as UiElement).checked);
  for (const r of qsa('#kflow input[name="kflow"]')) {
    r.onchange = (e) => saveKnowledgeFlow((e.target as UiElement).value);
  }
  el("project-location-change").onclick = changeProjectLocation;
  el("project-location-reveal").onclick = revealProjectFolder;
  el("add-context").onclick = () => el("file-input").click();
  el("file-input").onchange = (e) => {
    if ((e.target as UiElement).files[0]) addContextFile((e.target as UiElement).files[0]);
    (e.target as UiElement).value = "";
  };

  // Chat input
  el("chat-form").onsubmit = (e) => {
    e.preventDefault();
    sendMessage();
  };
  el("chat-input").onkeydown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };
  el("chat-input").oninput = (e) => updateDraft((e.target as UiElement).value);
  el("ctx-compact").onclick = compactConversation;
}

// Runs once the user is authenticated.
async function startApp(settings) {
  bindEvents();
  initNewProjectModal();
  initPrompt();
  initOrg();
  initTools();
  initSkills();
  initToolUse();
  initWebResearchHint();
  initTurns();
  initWorkingStrip();
  initRail(settings);
  initSidebar();
  initSettingsHub();
  initCustomize();
  bindModelEvents();
  state.lastModel = settings.lastModel || "";
  if (settings.sidebarCollapsed) el("app").classList.add("sidebar-collapsed");
  await refreshStatus();
  if (!(await refreshChromaStatus())) pollChromaUntilReady();
  await loadRecents();
  openProjectsGrid();
}

let started = false;
async function init() {
  const settings = await initSettings();
  initUpdates();
  initEmbedModel();
  initOllamaSetup(() => {
    refreshStatus();
  });

  initAuth(async () => {
    if (started) return;
    started = true;
    await startApp(settings);
    await runLaunchUpdateFlow(settings);
    await runEmbedLaunchFlow(settings);
    await runOllamaLaunchFlow(settings);
  });
}

init();
