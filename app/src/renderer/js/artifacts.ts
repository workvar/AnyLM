// Sidebar explorer for standalone and project-generated files.
import { el, node } from "./dom.js";
import { showMenu } from "./menu.js";
import { showView } from "./nav.js";
import { state } from "./state.js";

let mode: "roots" | "files" = "roots";
let currentRoot: ArtifactRoot | null = null;
let subscribed = false;

function setPane(open: boolean) {
  state.sidebarPane = open ? "artifacts" : "chats";
  el("artifacts-pane").classList.toggle("hidden", !open);
  el("side-chats-pane").classList.toggle("hidden", open);
  showView(state.view);
}

function renderEmpty(message: string) {
  const list = el("artifacts-list");
  list.innerHTML = "";
  list.appendChild(node("li", "artifacts-empty", message));
}

function renderRoots(roots: ArtifactRoot[]) {
  const list = el("artifacts-list");
  list.innerHTML = "";
  if (!roots.length) {
    renderEmpty("No artifact folders yet");
    return;
  }

  for (const root of roots) {
    const row = node("li", "artifact-row artifact-folder");
    row.appendChild(node("span", "artifact-icon", "▰"));
    row.appendChild(node("span", "artifact-name", root.label));
    row.onclick = () => openRoot(root);
    list.appendChild(row);
  }
}

function renderFiles(files: ProjectFileEntry[]) {
  const list = el("artifacts-list");
  list.innerHTML = "";
  if (!files.length) {
    renderEmpty("No files in this folder");
    return;
  }

  for (const file of files) {
    const row = node("li", "artifact-row artifact-file");
    row.appendChild(node("span", "artifact-icon", "▧"));
    row.appendChild(node("span", "artifact-name", file.name));
    if (file.ext) row.appendChild(node("span", "meta artifact-ext", file.ext.replace(/^\./, "").toUpperCase()));
    row.onclick = () => {
      if (currentRoot) void window.api.pfilesOpen(currentRoot.dir, file.name);
    };
    row.oncontextmenu = (event) => {
      event.preventDefault();
      if (!currentRoot) return;
      const root = currentRoot;
      showMenu(event.clientX, event.clientY, [
        {
          label: "Show in folder",
          onClick: async () => {
            await window.api.pfilesShow(root.dir, file.name);
          },
        },
        {
          label: "Delete",
          danger: true,
          onClick: async () => {
            if (!confirm(`Delete ${file.name} from disk?`)) return;
            await window.api.artifactsDelete(root.dir, file.name);
            await refreshArtifactsIfOpen();
          },
        },
      ]);
    };
    list.appendChild(row);
  }
}

async function loadRoots() {
  const roots = await window.api.artifactsListRoots();
  if (mode === "roots") renderRoots(roots);
}

async function loadFiles(root: ArtifactRoot) {
  const files = await window.api.artifactsListFiles(root.dir);
  if (mode === "files" && currentRoot?.dir === root.dir) renderFiles(files);
}

function openRoot(root: ArtifactRoot) {
  mode = "files";
  currentRoot = root;
  el("artifacts-title").textContent = root.label;
  el("artifacts-back").classList.remove("hidden");
  void loadFiles(root);
}

function showRoots() {
  mode = "roots";
  currentRoot = null;
  el("artifacts-title").textContent = "Artifacts";
  el("artifacts-back").classList.add("hidden");
  void loadRoots();
}

export function openArtifactsPane() {
  setPane(true);
  showRoots();
}

export function closeArtifactsPane() {
  if (state.sidebarPane === "artifacts") setPane(false);
}

export async function refreshArtifactsIfOpen() {
  if (state.sidebarPane !== "artifacts") return;
  if (mode === "files" && currentRoot) await loadFiles(currentRoot);
  else await loadRoots();
}

export function initArtifacts() {
  el("artifacts-back").onclick = showRoots;
  if (subscribed) return;
  subscribed = true;
  window.api.onFileGenerated(() => void refreshArtifactsIfOpen());
}
