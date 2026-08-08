// Main-area explorer for standalone and project-generated files.
import { el, node } from "./dom.js";
import { showMenu } from "./menu.js";
import { showView } from "./nav.js";
import { state } from "./state.js";
import { artifactKindIcon } from "./artifact-icons.js";

let mode: "roots" | "files" = "roots";
let currentRoot: ArtifactRoot | null = null;
let subscribed = false;

function listEl() {
  return el("artifacts-list");
}

function renderEmpty(message: string) {
  const list = listEl();
  list.innerHTML = "";
  list.appendChild(node("div", "grid-empty", message));
}

function setPathBar(dir: string | null) {
  const bar = el("artifacts-path");
  const label = el("artifacts-dir");
  if (!dir) {
    bar.classList.add("hidden");
    label.textContent = "";
    return;
  }
  bar.classList.remove("hidden");
  label.textContent = dir;
}

function makeTile(opts: {
  kind: "folder" | string;
  name: string;
  title?: string;
  onOpen: () => void;
  onContext?: (event: MouseEvent) => void;
}): HTMLElement {
  const tile = node("button", "artifact-tile");
  tile.setAttribute("type", "button");
  tile.title = opts.title || opts.name;
  tile.appendChild(artifactKindIcon(opts.kind));
  tile.appendChild(node("span", "artifact-tile-name", opts.name));
  tile.onclick = () => opts.onOpen();
  if (opts.onContext) {
    tile.oncontextmenu = (event) => {
      event.preventDefault();
      opts.onContext?.(event);
    };
  }
  return tile;
}

function renderRoots(roots: ArtifactRoot[]) {
  const list = listEl();
  list.innerHTML = "";
  list.className = "artifacts-icon-grid";
  if (!roots.length) {
    renderEmpty("No artifact folders yet");
    return;
  }

  for (const root of roots) {
    list.appendChild(
      makeTile({
        kind: "folder",
        name: root.label,
        title:
          root.kind === "generated"
            ? `${root.label} — standalone chats`
            : `${root.label} — project folder`,
        onOpen: () => openRoot(root),
      })
    );
  }
}

function renderFiles(files: ProjectFileEntry[]) {
  const list = listEl();
  list.innerHTML = "";
  list.className = "artifacts-icon-grid";
  if (!files.length) {
    renderEmpty("No files in this folder");
    return;
  }

  for (const file of files) {
    list.appendChild(
      makeTile({
        kind: file.ext || "file",
        name: file.name,
        onOpen: () => {
          if (currentRoot) void window.api.pfilesOpen(currentRoot.dir, file.name);
        },
        onContext: (event) => {
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
        },
      })
    );
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
  setPathBar(root.dir);
  void loadFiles(root);
}

function showRoots() {
  mode = "roots";
  currentRoot = null;
  el("artifacts-title").textContent = "Artifacts";
  el("artifacts-back").classList.add("hidden");
  setPathBar(null);
  void loadRoots();
}

export function openArtifactsPane() {
  showView("artifacts");
  showRoots();
}

export async function refreshArtifactsIfOpen() {
  if (state.view !== "artifacts") return;
  if (mode === "files" && currentRoot) await loadFiles(currentRoot);
  else await loadRoots();
}

export function initArtifacts() {
  el("artifacts-back").onclick = showRoots;
  if (subscribed) return;
  subscribed = true;
  window.api.onFileGenerated(() => void refreshArtifactsIfOpen());
}
