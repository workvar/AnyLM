// Inline chat cards for document generation: the permission prompt shown
// before a file is created, and the finished-file row with an Open-with split
// control (default app + dropdown for Preview / Show in folder when allowed).
import { el, node } from "./dom.js";
import { state } from "./state.js";
import { openFileViewer, openGeneratedViewer } from "./project-files.js";

const ICONS = { ".pdf": "📄", ".docx": "📝", ".pptx": "📊", ".xlsx": "📈", ".md": "🗒️" };

const TYPE_LINE = {
  ".pdf": "Document · PDF",
  ".docx": "Document · DOCX",
  ".pptx": "Presentation · PPTX",
  ".xlsx": "Spreadsheet · XLSX",
  ".md": "Document · MD",
};

let openMenuBound = false;

type DocConfirmReply = (token: string, approved: boolean) => void;

const liveDocConfirms = new Map<
  string,
  { card: HTMLElement; reply: DocConfirmReply; settled: boolean }
>();

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

function markDocConfirmDenied(card: HTMLElement, detail: string) {
  const actions = card.querySelector(".perm-actions");
  if (actions) actions.remove();
  card.classList.add("denied");
  if (!card.querySelector(".perm-result")) {
    card.appendChild(node("div", "perm-result", detail));
  }
}

/** Settle a live permission card (Allow/Deny/timeout/strip). Returns false if unknown/already settled. */
export function settleDocConfirm(token: string, approved: boolean, opts?: { notify?: boolean }): boolean {
  const entry = liveDocConfirms.get(String(token));
  if (!entry || entry.settled) return false;
  entry.settled = true;
  liveDocConfirms.delete(String(token));
  if (approved) {
    entry.card.remove();
  } else {
    markDocConfirmDenied(entry.card, "Denied");
  }
  if (opts?.notify !== false) entry.reply(String(token), approved);
  return true;
}

/** Expire cards whose confirm was auto-denied or cancelled without a click. */
export function expireDocConfirms(detail = "Timed out — not created"): void {
  for (const [token, entry] of [...liveDocConfirms]) {
    if (entry.settled) continue;
    entry.settled = true;
    liveDocConfirms.delete(token);
    markDocConfirmDenied(entry.card, detail);
  }
}

export function showDocConfirm({ token, args }, reply: DocConfirmReply) {
  const wrap = messagesEl();
  const key = String(token);
  // Replace a leftover card for the same token (e.g. re-attach after nav).
  const prior = liveDocConfirms.get(key);
  if (prior) {
    prior.settled = true;
    liveDocConfirms.delete(key);
    prior.card.remove();
  }

  const fmt = String(args.format || "").toLowerCase().replace(/^\./, "");
  const fname = `${args.title || "document"}.${fmt || "pdf"}`;

  const card = node("div", "perm-card");
  card.dataset.permToken = key;

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
        : "· Writes to Documents/AnyLM/generated"
    )
  );
  card.appendChild(desc);

  const actions = node("div", "perm-actions");
  const deny = node("button", "ghost small", "Deny");
  deny.type = "button";
  const allow = node("button", "primary small", "Allow");
  allow.type = "button";

  deny.onclick = () => settleDocConfirm(key, false);
  allow.onclick = () => settleDocConfirm(key, true);

  actions.append(deny, allow);
  card.appendChild(actions);

  liveDocConfirms.set(key, { card, reply, settled: false });
  wrap.appendChild(card);
  wrap.scrollTop = wrap.scrollHeight;
}

// Card for a generated file with split Open-with control.
export async function renderFileCard(
  { name, ext, dir }: { name: string; ext: string; dir: string },
  opts: { missing?: boolean; mount?: HTMLElement } = {}
) {
  const wrap = opts.mount || messagesEl();
  const projectId = currentProjectId();

  const card = node("div", "doc-card doc-file" + (opts.missing ? " missing" : ""));
  card.appendChild(node("div", "doc-card-icon", ICONS[ext] || "📄"));

  const body = node("div", "doc-card-body");
  body.appendChild(node("div", "doc-card-name", name));
  if (opts.missing) {
    body.appendChild(node("div", "doc-card-sub", "File missing"));
  } else {
    body.appendChild(
      node("div", "doc-card-sub", TYPE_LINE[ext] || String(ext || "").replace(/^\./, "").toUpperCase())
    );
  }
  card.appendChild(body);
  // Mount the shell first so the row keeps proper height while apps resolve.
  wrap.appendChild(card);
  wrap.scrollTop = wrap.scrollHeight;

  if (opts.missing) return;

  const { defaultApp, apps } = await window.api.pfilesAppsFor(dir, name).catch(() => ({
    defaultApp: null,
    apps: [],
  }));
  // Drop actions if this card was removed while we awaited (nav away / re-paint).
  if (!card.isConnected) return;

  const defaultLabel = defaultApp?.name
    ? `Open with ${defaultApp.name}`
    : "Open with Default app";

  const actions = node("div", "doc-card-actions");
  const split = node("div", "doc-open");
  const main = node("button", "doc-open-main");
  main.title = defaultLabel;
  main.setAttribute("aria-label", defaultLabel);
  main.appendChild(node("span", "doc-open-label-full", defaultLabel));
  main.appendChild(node("span", "doc-open-label-short", "Open"));
  const chevron = node("button", "doc-open-chevron", "▾");
  chevron.setAttribute("aria-label", "More open options");
  const menu = node("div", "doc-open-menu hidden");

  const openDefault = () => {
    closeOpenMenus();
    if (!dir) return;
    if (defaultApp) window.api.pfilesOpenWith(dir, name, defaultApp.id);
    else window.api.pfilesOpen(dir, name);
  };
  // Previewable in-app whether or not this chat belongs to a project — a
  // standalone chat used to offer nothing but "Show in folder".
  const canPreview = [".pdf", ".md", ".docx", ".pptx"].includes(ext);
  const preview = () => {
    closeOpenMenus();
    if (projectId) openFileViewer(projectId, name);
    else openGeneratedViewer(dir, name);
  };
  const showFolder = () => {
    closeOpenMenus();
    if (dir) window.api.pfilesShow(dir, name);
  };

  if (!apps.length) {
    const itemDefault = node("button", "doc-open-item", defaultLabel);
    itemDefault.onclick = (e) => {
      e.stopPropagation();
      openDefault();
    };
    menu.appendChild(itemDefault);
  }

  for (const app of apps) {
    const item = node("button", "doc-open-item", `Open with ${app.name}`);
    item.onclick = (e) => {
      e.stopPropagation();
      window.api.pfilesOpenWith(dir, name, app.id);
    };
    menu.appendChild(item);
  }

  if (canPreview) {
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
  if (canPreview) {
    // Seeing the file in the app is the common case, so it gets its own button
    // rather than living two clicks deep in the dropdown.
    const previewBtn = node("button", "doc-preview-btn", "Preview");
    previewBtn.title = "Preview in AnyLM";
    previewBtn.onclick = (e) => {
      e.stopPropagation();
      preview();
    };
    actions.appendChild(previewBtn);
  }
  actions.append(split, menu);
  card.appendChild(actions);

  if (!openMenuBound) {
    openMenuBound = true;
    document.addEventListener("click", () => closeOpenMenus());
  }

  wrap.scrollTop = wrap.scrollHeight;
}

export function showFileCard(info: { name: string; ext: string; dir: string }) {
  return renderFileCard(info);
}
