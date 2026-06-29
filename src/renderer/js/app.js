// App bootstrap: status, sidebar tabs, conversation wiring, and event binding.
import { el } from "./dom.js";
import { state } from "./state.js";
import {
  loadProjects,
  createProject,
  deleteCurrentProject,
  scheduleProjectName,
  scheduleInstructions,
  saveProjectModel,
  toggleProjectLock,
  openProjectSettings,
  saveKnowledgeFlow,
  addContextFile,
} from "./projects.js";
import {
  loadChats,
  createChat,
  deleteCurrentChat,
  scheduleChatName,
  saveChatModel,
} from "./chats.js";
import { sendMessage } from "./chat.js";
import { initAuth } from "./auth.js";
import { initSettings } from "./settings.js";
import { initUpdates, runLaunchUpdateFlow } from "./updates.js";
import { initModelDropdown } from "./dropdown.js";
import { initAttach } from "./attach.js";
import { updateDraft } from "./contextmeter.js";
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

// --- Sidebar tabs ---
function switchTab(tab) {
  state.tab = tab;
  for (const b of document.querySelectorAll("#sidebar-tabs .tab")) {
    b.classList.toggle("active", b.dataset.tab === tab);
  }
  const projects = tab === "projects";
  el("project-list").classList.toggle("hidden", !projects);
  el("chat-list").classList.toggle("hidden", projects);
  el("new-item").textContent = projects ? "+ New project" : "+ New chat";
  return projects ? loadProjects() : loadChats();
}

function toggleSidebar() {
  const collapsed = el("app").classList.toggle("sidebar-collapsed");
  window.api.setSettings({ sidebarCollapsed: collapsed });
}

function closeModal(id) {
  el(id).classList.add("hidden");
}

function bindEvents() {
  // Tabs + new item
  for (const b of document.querySelectorAll("#sidebar-tabs .tab")) {
    b.onclick = () => switchTab(b.dataset.tab);
  }
  el("new-item").onclick = () => (state.tab === "projects" ? createProject() : createChat());

  // Sidebar collapse
  el("sidebar-toggle").onclick = toggleSidebar;
  el("sidebar-toggle-empty").onclick = toggleSidebar;

  // Conversation header (shared by projects + chats)
  el("convo-name").oninput = () =>
    state.mode === "project" ? scheduleProjectName() : scheduleChatName();
  el("delete-convo").onclick = () =>
    state.mode === "project" ? deleteCurrentProject() : deleteCurrentChat();
  el("project-settings-btn").onclick = openProjectSettings;
  initModelDropdown(() =>
    state.mode === "project" ? saveProjectModel() : saveChatModel()
  );
  initAttach();

  // Project settings modal
  el("project-modal-close").onclick = () => closeModal("project-modal");
  el("project-modal").onclick = (e) => {
    if (e.target.id === "project-modal") closeModal("project-modal");
  };
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
  if (settings.sidebarCollapsed) el("app").classList.add("sidebar-collapsed");
  await refreshStatus();
  await switchTab("projects");
}

let started = false;
async function init() {
  const settings = await initSettings();
  initUpdates();

  initAuth(async () => {
    if (started) return;
    started = true;
    await startApp(settings);
    runLaunchUpdateFlow(settings);
  });
}

init();
