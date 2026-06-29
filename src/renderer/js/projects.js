// Project loading, selection, CRUD, autosave, settings modal, and context.
import { el } from "./dom.js";
import { state } from "./state.js";
import { renderProjectList, renderContextList, addPendingContext } from "./views.js";
import { getSelectedModel, setModelDropdownEnabled } from "./dropdown.js";
import { openConvo, showEmpty } from "./convo.js";
import { loadProjectThreads } from "./threads.js";

export async function loadProjects() {
  state.projects = await window.api.listProjects();
  const activeId = state.mode === "project" ? state.current?.id : null;
  renderProjectList(state.projects, activeId, selectProject);
}

export async function selectProject(id) {
  state.current = await window.api.getProject(id);
  openConvo({
    mode: "project",
    name: state.current.name,
    model: state.current.model,
    modelLocked: !!state.current.modelLocked,
    showProjectBtn: true,
    placeholder: "Message your project model…",
  });
  await loadProjectThreads(); // loads threads, selects one, renders history
  renderProjectList(state.projects, id, selectProject);
}

export async function createProject() {
  const p = await window.api.createProject({
    name: "Untitled project",
    model: state.models[0] || "",
  });
  await loadProjects();
  await selectProject(p.id);
  el("convo-name").focus();
}

export async function deleteCurrentProject() {
  if (!state.current) return;
  await window.api.deleteProject(state.current.id);
  showEmpty();
  await loadProjects();
}

// --- Autosaved fields ---
let nameTimer;
export function scheduleProjectName() {
  clearTimeout(nameTimer);
  nameTimer = setTimeout(saveProjectName, 400);
}
async function saveProjectName() {
  if (state.mode !== "project" || !state.current) return;
  const patch = { name: el("convo-name").value || "Untitled project" };
  state.current = { ...state.current, ...patch };
  await window.api.updateProject(state.current.id, patch);
  await loadProjects();
}

let insTimer;
export function scheduleInstructions() {
  clearTimeout(insTimer);
  insTimer = setTimeout(saveInstructions, 400);
}
async function saveInstructions() {
  if (!state.current) return;
  const patch = { instructions: el("instructions").value };
  state.current = { ...state.current, ...patch };
  await window.api.updateProject(state.current.id, patch);
}

export async function saveProjectModel() {
  if (state.mode !== "project" || !state.current) return;
  const patch = { model: getSelectedModel() };
  state.current = { ...state.current, ...patch };
  await window.api.updateProject(state.current.id, patch);
  await loadProjects();
}

export async function toggleProjectLock(locked) {
  if (!state.current) return;
  state.current = { ...state.current, modelLocked: locked };
  setModelDropdownEnabled(!locked);
  await window.api.updateProject(state.current.id, { modelLocked: locked });
}

// --- Settings modal + context ---
// Map the project's import/export booleans to a single radio value.
function flowValue(p) {
  if (p.importGeneral && p.exportToGeneral) return "open";
  if (p.importGeneral) return "import";
  if (p.exportToGeneral) return "export";
  return "isolated";
}

export function openProjectSettings() {
  if (state.mode !== "project" || !state.current) return;
  el("instructions").value = state.current.instructions || "";
  el("model-lock").checked = !!state.current.modelLocked;
  const value = flowValue(state.current);
  for (const r of document.querySelectorAll('#kflow input[name="kflow"]')) {
    r.checked = r.value === value;
  }
  renderContextList(state.current.contexts, removeContext);
  el("project-modal").classList.remove("hidden");
}

export async function saveKnowledgeFlow(value) {
  if (!state.current) return;
  const patch = {
    importGeneral: value === "import" || value === "open",
    exportToGeneral: value === "export" || value === "open",
  };
  state.current = { ...state.current, ...patch };
  await window.api.updateProject(state.current.id, patch);
}

export async function addContextFile(file) {
  if (!state.current || !file) return;
  addPendingContext(file.name); // immediate "Indexing…" row
  try {
    const content = await file.text();
    await window.api.addContext(state.current.id, { name: file.name, content });
    state.current = await window.api.getProject(state.current.id);
  } finally {
    renderContextList(state.current.contexts, removeContext);
  }
  await loadProjects();
}

export async function removeContext(contextId) {
  await window.api.removeContext(state.current.id, contextId);
  state.current = await window.api.getProject(state.current.id);
  renderContextList(state.current.contexts, removeContext);
  await loadProjects();
}
