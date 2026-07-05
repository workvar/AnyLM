// The project's Files tab (contents of its on-disk folder) and the in-app
// viewer for MD, PDF, and text files.
import { el, node } from "./dom.js";
import { state } from "./state.js";
import { relTime } from "./views.js";
import { renderMarkdown } from "./markdown.js";

function fmtSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// --- Chats/Files tab toggle inside the project detail view ---
export function initDetailTabs() {
  for (const b of document.querySelectorAll("#detail-tabs button")) {
    b.onclick = () => {
      for (const x of document.querySelectorAll("#detail-tabs button"))
        x.classList.toggle("active", x === b);
      const files = b.dataset.tab === "files";
      el("project-chats").classList.toggle("hidden", files);
      el("project-files").classList.toggle("hidden", !files);
      if (files) renderProjectFiles();
    };
  }
}

// Reset the detail view to the Chats tab (called when a project opens).
export function resetDetailTabs() {
  for (const x of document.querySelectorAll("#detail-tabs button"))
    x.classList.toggle("active", x.dataset.tab === "chats");
  el("project-chats").classList.remove("hidden");
  el("project-files").classList.add("hidden");
}

export async function renderProjectFiles() {
  const wrap = el("project-files");
  wrap.innerHTML = "";
  if (!state.viewProject) return;
  const { dir, files } = await window.api.pfilesList(state.viewProject.id);

  const head = node("div", "files-head");
  head.appendChild(node("span", "files-dir", dir || "No folder set for this project."));
  if (dir) {
    const show = node("button", "ghost small", "Show in folder");
    show.onclick = () => window.api.pfilesReveal(state.viewProject.id);
    head.appendChild(show);
  }
  wrap.appendChild(head);

  if (!dir) {
    wrap.appendChild(
      node("div", "grid-empty", "Set a storage folder in Manage to collect this project's files.")
    );
    return;
  }
  if (!files.length) {
    wrap.appendChild(
      node("div", "grid-empty", "No files yet. Exports and the decisions log will appear here.")
    );
    return;
  }

  const table = node("div", "org-table");
  for (const f of files) {
    const row = node("div", "org-row file-row");
    const main = node("div", "org-cell org-who");
    main.appendChild(node("div", "org-who-name", f.name));
    main.appendChild(node("div", "org-who-mail", `${fmtSize(f.size)} · updated ${relTime(f.mtime)}`));
    row.appendChild(main);
    row.onclick = () => openFile(f.name);
    table.appendChild(row);
  }
  wrap.appendChild(table);
}

// --- In-app viewer ---
export function initFileViewer() {
  el("viewer-close").onclick = closeViewer;
  el("file-viewer-modal").onclick = (e) => {
    if (e.target.id === "file-viewer-modal") closeViewer();
  };
}

function closeViewer() {
  el("file-viewer-modal").classList.add("hidden");
  el("viewer-body").innerHTML = ""; // drop the PDF iframe
}

async function openFile(name) {
  const f = await window.api.pfilesRead(state.viewProject.id, name);
  if (!f) return;
  el("viewer-title").textContent = f.name;
  const body = el("viewer-body");
  body.innerHTML = "";
  if (f.ext === ".pdf") {
    const frame = document.createElement("iframe");
    frame.src = f.url;
    body.appendChild(frame);
  } else if (f.ext === ".md") {
    const div = node("div", "viewer-md");
    div.innerHTML = renderMarkdown(f.content || "");
    body.appendChild(div);
  } else {
    const pre = document.createElement("pre");
    pre.className = "viewer-pre";
    pre.textContent = f.content || "";
    body.appendChild(pre);
  }
  el("file-viewer-modal").classList.remove("hidden");
}
