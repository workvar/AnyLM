// Projects: grid, a project's chats view, archive, settings modal, and context.
import { el, qsa } from "./dom.js";
import { state } from "./state.js";
import { renderProjectCards, renderProjectChats, renderContextList, addPendingContext } from "./views.js";
import { getSelectedModel, setModelDropdownEnabled } from "./dropdown.js";
import { showView } from "./nav.js";
import { closeArtifactsPane } from "./artifacts.js";
import { showMenu, type MenuItem } from "./menu.js";
import { promptText } from "./prompt.js";
import { fetchThreads, openThread, archiveThread } from "./threads.js";
import { loadRecents } from "./recents.js";
import { resetDetailTabs } from "./project-files.js";
import { slugFolderName } from "./folder-slug.js";

// --- Grid ---
export async function loadProjects() {
  state.projects = await window.api.listProjects();
  renderGrid();
}

function visibleProjects() {
  let list = state.projects.filter((p) => (state.showArchived ? p.archived : !p.archived));
  const q = state.projectQuery.trim().toLowerCase();
  if (q) list = list.filter((p) => (p.name || "").toLowerCase().includes(q));
  list = list.slice();
  if (state.projectSort === "name") list.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  else list.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  return list;
}

export function renderGrid() {
  const empty = state.showArchived
    ? "No archived projects."
    : "No projects yet. Create one to get started.";
  renderProjectCards(visibleProjects(), empty, { onOpen: openProject, onMenu: projectMenu });
}

function projectMenu(p, x, y) {
  const items: MenuItem[] = [
    { label: "Open", onClick: () => openProject(p.id) },
    { label: "Manage", onClick: () => openProjectSettingsFor(p.id) },
  ];
  if (p.archived) items.push({ label: "Unarchive", onClick: () => unarchiveProject(p.id) });
  else items.push({ label: "Archive", danger: true, onClick: () => archiveProject(p.id) });
  showMenu(x, y, items);
}

// --- A single project's chats ---
function renderDetail() {
  renderProjectChats(state.viewProject.folders || [], state.threads, {
    onOpen: openThread,
    onChatMenu: threadMenu,
    onFolderMenu: folderMenu,
  });
}

export async function openProject(id) {
  closeArtifactsPane();
  state.current = await window.api.getProject(id);
  state.viewProject = state.current;
  state.mode = null;
  el("detail-title").textContent = state.current.name || "Untitled project";
  await fetchThreads();
  renderDetail();
  resetDetailTabs();
  showView("project");
  await loadRecents(); // clear any stale conversation highlight in the sidebar
}

async function refreshDetail() {
  state.current = await window.api.getProject(state.viewProject.id);
  state.viewProject = state.current;
  await fetchThreads();
  renderDetail();
}

function threadMenu(t, x, y) {
  showMenu(x, y, [
    { label: "Open", onClick: () => openThread(t.id) },
    { label: "Move to…", onClick: () => moveMenu(t, x, y) },
    {
      label: "Archive",
      danger: true,
      onClick: async () => {
        await archiveThread(state.viewProject.id, t.id);
        await refreshDetail();
      },
    },
  ]);
}

// --- Subfolders ---
function moveMenu(t, x, y) {
  const folders = state.viewProject.folders || [];
  const mark = (on) => (on ? " ✓" : "");
  const items = [{ label: "Ungrouped" + mark(!t.folderId), onClick: () => moveThread(t.id, null) }];
  for (const f of folders) {
    items.push({ label: f.name + mark(f.id === t.folderId), onClick: () => moveThread(t.id, f.id) });
  }
  items.push({ label: "+ New folder…", onClick: () => newFolderForThread(t) });
  showMenu(x, y, items);
}

async function moveThread(threadId, folderId) {
  await window.api.updateThread(state.viewProject.id, threadId, { folderId });
  await refreshDetail();
}

export async function newFolder() {
  if (!state.viewProject) return;
  const name = await promptText("New folder", "");
  if (!name) return;
  await window.api.addFolder(state.viewProject.id, name);
  await refreshDetail();
}

async function newFolderForThread(t) {
  const name = await promptText("New folder", "");
  if (!name) return;
  const f = await window.api.addFolder(state.viewProject.id, name);
  if (f) await window.api.updateThread(state.viewProject.id, t.id, { folderId: f.id });
  await refreshDetail();
}

function folderMenu(f, x, y) {
  showMenu(x, y, [
    {
      label: "Rename",
      onClick: async () => {
        const name = await promptText("Rename folder", f.name);
        if (!name) return;
        await window.api.renameFolder(state.viewProject.id, f.id, name);
        await refreshDetail();
      },
    },
    {
      label: "Delete folder",
      danger: true,
      onClick: async () => {
        await window.api.removeFolder(state.viewProject.id, f.id);
        await refreshDetail();
      },
    },
  ]);
}

// Open a thread reached from the global recents list.
export async function openRecentThread(projectId, threadId) {
  state.current = await window.api.getProject(projectId);
  state.viewProject = state.current;
  await fetchThreads();
  await openThread(threadId);
}

// --- CRUD ---
// Creation dialog: name + storage location (defaults to Documents/AnyLM/Projects).
let npDefault = "";
let npLocationManual = false;

function updateNpLocation() {
  if (npLocationManual) return;
  const name = el("np-name").value.trim() || "Untitled project";
  el("np-location").value = npDefault ? `${npDefault}/${slugFolderName(name)}` : "";
}

export async function initNewProjectModal() {
  el("np-browse").onclick = async () => {
    const dir = await window.api.pfilesPickFolder();
    if (!dir) return;
    npLocationManual = true;
    el("np-location").value = dir;
  };
  el("np-cancel").onclick = () => el("new-project-modal").classList.add("hidden");
  el("new-project-modal").onclick = (e) => {
    if ((e.target as UiElement).id === "new-project-modal") el("new-project-modal").classList.add("hidden");
  };
  el("np-name").oninput = updateNpLocation;
  el("np-location").oninput = () => {
    npLocationManual = true;
  };
  el("np-name").onkeydown = (e) => {
    if (e.key === "Enter") el("np-create").click();
  };
  el("np-create").onclick = async () => {
    const name = el("np-name").value.trim() || "Untitled project";
    el("new-project-modal").classList.add("hidden");
    const folderPath = el("np-location").value.trim() || null;
    const p = await window.api.createProject({
      name,
      model: state.models[0] || "",
      folderPath,
    });
    await loadProjects();
    await openProject(p.id);
    openProjectSettings(); // let the user configure it right away
  };
}

export async function createProject() {
  npLocationManual = false;
  if (!npDefault) npDefault = await window.api.pfilesDefaultBase();
  el("np-name").value = "";
  updateNpLocation();
  el("new-project-modal").classList.remove("hidden");
  el("np-name").focus();
}

export async function changeProjectLocation() {
  if (!state.current) return;
  const dir = await window.api.pfilesPickFolder();
  if (!dir) return;
  const set = await window.api.pfilesSetLocation(state.current.id, dir);
  if (set) {
    state.current = { ...state.current, folderPath: set };
    el("project-location").value = set;
  } else {
    alert("Unable to create or use that project folder. Check the path and its permissions.");
  }
}

export async function saveProjectLocation() {
  if (!state.current) return;
  const dir = el("project-location").value.trim();
  if (!dir) return;
  const set = await window.api.pfilesSetLocation(state.current.id, dir);
  if (set) {
    state.current = { ...state.current, folderPath: set };
    el("project-location").value = set;
  } else {
    alert("Unable to create or use that project folder. Check the path and its permissions.");
  }
}

export function revealProjectFolder() {
  if (state.current) window.api.pfilesReveal(state.current.id);
}

export async function archiveProject(id) {
  await window.api.updateProject(id, { archived: true });
  await loadProjects();
  await loadRecents();
}

export async function unarchiveProject(id) {
  await window.api.updateProject(id, { archived: false });
  await loadProjects();
  await loadRecents();
}

// --- Autosaved fields (settings modal) ---
let nameTimer;
export function scheduleProjectName() {
  clearTimeout(nameTimer);
  nameTimer = setTimeout(saveProjectName, 400);
}
async function saveProjectName() {
  if (!state.current) return;
  const name = el("project-name-input").value || "Untitled project";
  state.current = { ...state.current, name };
  await window.api.updateProject(state.current.id, { name });
  if (state.viewProject && state.viewProject.id === state.current.id) {
    state.viewProject.name = name;
    el("detail-title").textContent = name;
  }
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
  if (!state.current) return;
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

export async function toggleOrgShare(shared) {
  if (!state.current) return;
  state.current = { ...state.current, shareToOrg: shared };
  await window.api.updateProject(state.current.id, { shareToOrg: shared });
}

export async function toggleAutoLog(on) {
  if (!state.current) return;
  state.current = { ...state.current, autoLog: on };
  await window.api.updateProject(state.current.id, { autoLog: on });
}

// --- Settings modal + context ---
function flowValue(p) {
  if (p.importGeneral && p.exportToGeneral) return "open";
  if (p.importGeneral) return "import";
  if (p.exportToGeneral) return "export";
  return "isolated";
}

// Open settings for an arbitrary project id (used by the card "Manage" action).
export async function openProjectSettingsFor(id) {
  state.current = await window.api.getProject(id);
  state.viewProject = state.current;
  openProjectSettings();
}

const PROJECT_SETTINGS_TABS = ["general", "memory", "context"] as const;
type ProjectSettingsTab = (typeof PROJECT_SETTINGS_TABS)[number];

export function showProjectSettingsTab(tab: ProjectSettingsTab) {
  for (const b of qsa("#project-settings-tabs button")) {
    b.classList.toggle("active", b.dataset.tab === tab);
  }
  for (const id of PROJECT_SETTINGS_TABS) {
    el(`ps-panel-${id}`).classList.toggle("hidden", id !== tab);
  }
}

export function initProjectSettingsTabs() {
  for (const b of qsa("#project-settings-tabs button")) {
    b.onclick = () => {
      const tab = b.dataset.tab as ProjectSettingsTab;
      if (!PROJECT_SETTINGS_TABS.includes(tab)) return;
      showProjectSettingsTab(tab);
    };
  }
}

export function openProjectSettings() {
  if (!state.current) return;
  el("project-name-input").value = state.current.name || "";
  el("instructions").value = state.current.instructions || "";
  el("model-lock").checked = !!state.current.modelLocked;
  el("org-share").checked = !!state.current.shareToOrg;
  el("auto-log").checked = !!state.current.autoLog;
  el("project-location").value = state.current.folderPath || "";
  const value = flowValue(state.current);
  for (const r of qsa('#kflow input[name="kflow"]')) {
    r.checked = r.value === value;
  }
  renderContextList(state.current.contexts, removeContext);
  showProjectSettingsTab("general");
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
  addPendingContext(file.name);
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
