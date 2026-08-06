// Inline chat cards for document generation: the permission prompt shown
// before a file is created, and the finished-file row with an Open-with split
// control (default app + dropdown for Preview / Show in folder when allowed).
import { el, node } from "./dom.js";
import { state } from "./state.js";
import { openFileViewer } from "./project-files.js";

const ICONS = { ".pdf": "📄", ".docx": "📝", ".pptx": "📊", ".xlsx": "📈", ".md": "🗒️" };

const TYPE_LINE = {
  ".pdf": "Document · PDF",
  ".docx": "Document · DOCX",
  ".pptx": "Presentation · PPTX",
  ".xlsx": "Spreadsheet · XLSX",
  ".md": "Document · MD",
};

let openMenuBound = false;

function closeOpenMenus(except?: Element | null) {
  for (const m of document.querySelectorAll(".doc-open-menu")) {
    if (except && m === except) continue;
    m.classList.add("hidden");
  }
}

function messagesEl() {
  return el("messages");
}

function currentProjectId() {
  if (state.mode !== "project") return null;
  return (state.viewProject && state.viewProject.id) || (state.current && state.current.id) || null;
}

export function showDocConfirm({ token, args }, reply) {
  const wrap = messagesEl();
  const fmt = String(args.format || "").toLowerCase().replace(/^\./, "");
  const fname = `${args.title || "document"}.${fmt || "pdf"}`;

  const card = node("div", "perm-card");
  card.dataset.permToken = String(token);

  card.appendChild(node("div", "perm-ask", "Create a file in your folder?"));

  const desc = node("div", "perm-desc");
  desc.appendChild(node("span", "perm-ext", (fmt || "pdf").toUpperCase()));
  desc.appendChild(node("span", "perm-file", fname));
  desc.appendChild(
    node(
      "span",
      "perm-where",
      currentProjectId()
        ? "· Writes to this project's storage folder"
        : "· Writes to your Documents/AnyLM folder"
    )
  );
  card.appendChild(desc);

  const actions = node("div", "perm-actions");
  const deny = node("button", "ghost small", "Deny");
  const allow = node("button", "primary small", "Allow");

  deny.onclick = () => {
    if (card.classList.contains("denied")) return;
    deny.disabled = true;
    allow.disabled = true;
    reply(token, false);
    actions.remove();
    card.classList.add("denied");
    card.appendChild(node("div", "perm-result", "Denied"));
  };

  allow.onclick = () => {
    deny.disabled = true;
    allow.disabled = true;
    card.remove();
    reply(token, true);
  };

  actions.append(deny, allow);
  card.appendChild(actions);

  wrap.appendChild(card);
  wrap.scrollTop = wrap.scrollHeight;
}

// Card for a generated file with split Open-with control.
export function showFileCard({ name, ext, dir }) {
  const wrap = messagesEl();
  const projectId = currentProjectId();

  const card = node("div", "doc-card doc-file");
  card.appendChild(node("div", "doc-card-icon", ICONS[ext] || "📄"));

  const body = node("div", "doc-card-body");
  body.appendChild(node("div", "doc-card-name", name));
  body.appendChild(
    node("div", "doc-card-sub", TYPE_LINE[ext] || String(ext || "").replace(/^\./, "").toUpperCase())
  );
  card.appendChild(body);

  const actions = node("div", "doc-card-actions");
  const split = node("div", "doc-open");
  const main = node("button", "doc-open-main", "Open with Default app");
  const chevron = node("button", "doc-open-chevron", "▾");
  chevron.setAttribute("aria-label", "More open options");
  const menu = node("div", "doc-open-menu hidden");

  const openDefault = () => {
    closeOpenMenus();
    if (dir) window.api.pfilesOpen(dir, name);
  };
  const preview = () => {
    closeOpenMenus();
    if (projectId) openFileViewer(projectId, name);
  };
  const showFolder = () => {
    closeOpenMenus();
    if (dir) window.api.pfilesShow(dir, name);
  };

  const itemDefault = node("button", "doc-open-item", "Open with Default app");
  itemDefault.onclick = (e) => {
    e.stopPropagation();
    openDefault();
  };
  menu.appendChild(itemDefault);

  if (projectId) {
    const itemPreview = node("button", "doc-open-item", "Preview in AnyLM");
    itemPreview.onclick = (e) => {
      e.stopPropagation();
      preview();
    };
    menu.appendChild(itemPreview);
  }

  const itemFolder = node("button", "doc-open-item", "Show in folder");
  itemFolder.onclick = (e) => {
    e.stopPropagation();
    showFolder();
  };
  menu.appendChild(itemFolder);

  main.onclick = (e) => {
    e.stopPropagation();
    openDefault();
  };
  chevron.onclick = (e) => {
    e.stopPropagation();
    const opening = menu.classList.contains("hidden");
    closeOpenMenus();
    if (opening) menu.classList.remove("hidden");
  };

  split.append(main, chevron);
  actions.append(split, menu);
  card.appendChild(actions);

  if (!openMenuBound) {
    openMenuBound = true;
    document.addEventListener("click", () => closeOpenMenus());
  }

  wrap.appendChild(card);
  wrap.scrollTop = wrap.scrollHeight;
}
