// App bootstrap: load models, projects, Ollama status, and bind events.
import { el } from "./dom.js";
import { state } from "./state.js";
import {
  loadProjects,
  createProject,
  deleteCurrent,
  scheduleSave,
  saveFields,
  addContextFile,
} from "./projects.js";
import { sendMessage } from "./chat.js";
import { initAuth } from "./auth.js";
import { initSettings } from "./settings.js";
import { initUpdates, runLaunchUpdateFlow } from "./updates.js";

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

function bindEvents() {
  el("new-project").onclick = createProject;
  el("delete-project").onclick = deleteCurrent;
  el("project-name").oninput = scheduleSave;
  el("instructions").oninput = scheduleSave;
  el("model-select").onchange = saveFields;

  el("add-context").onclick = () => el("file-input").click();
  el("file-input").onchange = (e) => {
    if (e.target.files[0]) addContextFile(e.target.files[0]);
    e.target.value = "";
  };

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
}

// Runs once the user is authenticated.
async function startApp() {
  bindEvents();
  await refreshStatus();
  await loadProjects();
}

let started = false;
async function init() {
  // Theme + update wiring apply regardless of auth state (theme also covers
  // the sign-in screen). initSettings paints the saved theme immediately.
  const settings = await initSettings();
  initUpdates();

  initAuth(async () => {
    if (started) return;
    started = true;
    await startApp();
    runLaunchUpdateFlow(settings);
  });
}

init();
