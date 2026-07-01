// App bootstrap: status, navigation, conversation wiring, and event binding.
import { el } from "./dom.js";
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
  saveKnowledgeFlow,
  addContextFile,
  newFolder,
} from "./projects.js";
import { createChat, saveChatModel, scheduleChatName } from "./chats.js";
import { createProjectThread, scheduleThreadName } from "./threads.js";
import { loadRecents } from "./recents.js";
import { showView } from "./nav.js";
import { initPrompt } from "./prompt.js";
import { sendMessage } from "./chat.js";
import { initAuth } from "./auth.js";
import { initSettings } from "./settings.js";
import { initUpdates, runLaunchUpdateFlow } from "./updates.js";
import { initEmbedModel, runEmbedLaunchFlow } from "./embedmodel.js";
import { initModelDropdown } from "./dropdown.js";
import { initAttach } from "./attach.js";
import { updateDraft } from "./contextmeter.js";
import { openModelsView, loadModels, bindEvents as bindModelEvents } from "./models.js";
import { compactConversation } from "./compact.js";

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

function openModelsViewHandler() {
  showView("models");
  openModelsView();
  bindModelEvents();
}

function bindEvents() {
  // Sidebar
  el("new-chat-btn").onclick = createChat;
  el("projects-nav").onclick = openProjectsGrid;
  el("models-nav").onclick = openModelsViewHandler;
  el("sidebar-toggle").onclick = toggleSidebar;
  el("sidebar-toggle-projects").onclick = toggleSidebar;
  el("sidebar-toggle-detail").onclick = toggleSidebar;
  el("sidebar-toggle-models").onclick = toggleSidebar;

  // Projects grid controls
  el("new-project-btn").onclick = createProject;
  el("projects-search").oninput = (e) => {
    state.projectQuery = e.target.value;
    renderGrid();
  };
  for (const b of document.querySelectorAll("#projects-sort button")) {
    b.onclick = () => {
      state.projectSort = b.dataset.sort;
      for (const x of document.querySelectorAll("#projects-sort button"))
        x.classList.toggle("active", x === b);
      renderGrid();
    };
  }
  el("show-archived").onchange = (e) => {
    state.showArchived = e.target.checked;
    renderGrid();
  };

  // Project detail
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

  // Project settings modal
  el("project-modal-close").onclick = () => closeModal("project-modal");
  el("project-modal").onclick = (e) => {
    if (e.target.id === "project-modal") closeModal("project-modal");
  };
  el("project-name-input").oninput = scheduleProjectName;
  el("instructions").oninput = scheduleInstructions;
  el("model-lock").onchange = (e) => toggleProjectLock(e.target.checked);
  for (const r of document.querySelectorAll('#kflow input[name="kflow"]')) {
    r.onchange = (e) => saveKnowledgeFlow(e.target.value);
  }
  el("add-context").onclick = () => el("file-input").click();
  el("file-input").onchange = (e) => {
    if (e.target.files[0]) addContextFile(e.target.files[0]);
    e.target.value = "";
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
  el("chat-input").oninput = (e) => updateDraft(e.target.value);
  el("ctx-compact").onclick = compactConversation;
}

// Runs once the user is authenticated.
async function startApp(settings) {
  bindEvents();
  initPrompt();
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

  initAuth(async () => {
    if (started) return;
    started = true;
    await startApp(settings);
    runLaunchUpdateFlow(settings);
    runEmbedLaunchFlow(settings);
  });
}

init();
