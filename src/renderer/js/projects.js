// Project loading, selection, CRUD, field autosave, and context add/remove.
import { el } from "./dom.js";
import { state } from "./state.js";
import { renderProjectList, renderModelOptions, renderContextList } from "./views.js";
import { resetChat } from "./chat.js";

export async function loadProjects() {
  state.projects = await window.api.listProjects();
  renderProjectList(state.projects, state.current?.id, selectProject);
}

export async function selectProject(id) {
  state.current = await window.api.getProject(id);
  resetChat();
  el("empty-state").classList.add("hidden");
  el("project-view").classList.remove("hidden");
  el("project-name").value = state.current.name;
  el("instructions").value = state.current.instructions || "";
  renderModelOptions(state.models, state.current.model);
  renderContextList(state.current.contexts, removeContext);
  renderProjectList(state.projects, id, selectProject);
}

export async function createProject() {
  const p = await window.api.createProject({
    name: "Untitled project",
    model: state.models[0] || "",
  });
  await loadProjects();
  await selectProject(p.id);
  el("project-name").focus();
}

export async function deleteCurrent() {
  if (!state.current) return;
  await window.api.deleteProject(state.current.id);
  state.current = null;
  el("project-view").classList.add("hidden");
  el("empty-state").classList.remove("hidden");
  await loadProjects();
}

// Debounced save of name / instructions / model.
let saveTimer;
export function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveFields, 400);
}

export async function saveFields() {
  if (!state.current) return;
  const patch = {
    name: el("project-name").value || "Untitled project",
    instructions: el("instructions").value,
    model: el("model-select").value,
  };
  state.current = { ...state.current, ...patch };
  await window.api.updateProject(state.current.id, patch);
  await loadProjects();
}

export async function addContextFile(file) {
  if (!state.current || !file) return;
  const content = await file.text();
  await window.api.addContext(state.current.id, { name: file.name, content });
  state.current = await window.api.getProject(state.current.id);
  renderContextList(state.current.contexts, removeContext);
  await loadProjects();
}

export async function removeContext(contextId) {
  await window.api.removeContext(state.current.id, contextId);
  state.current = await window.api.getProject(state.current.id);
  renderContextList(state.current.contexts, removeContext);
  await loadProjects();
}
