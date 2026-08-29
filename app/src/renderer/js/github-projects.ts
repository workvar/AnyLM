// GitHub Projects sync view: connect an account, list synced boards, and
// show one board as a table. Kept deliberately small — see
// docs/github-projects-sync.md for the fuller picture (the Cloudflare Worker
// relay and Firestore schema this reads from) and app/src/main/github/ for
// the backend half of every call this file makes.
import { el, node, qsa } from "./dom.js";
import { showView } from "./nav.js";

let projects: GithubProjectSummary[] = [];
let openProjectId: string | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;

const POLL_MS = 4000; // see docs/github-projects-sync.md: this stands in for push

function stopPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

function setListMode(signedIn: boolean) {
  el("github-signed-out").classList.toggle("hidden", signedIn);
  el("github-projects-list").classList.toggle("hidden", !signedIn);
  el("github-connect-btn").classList.toggle("hidden", signedIn);
  el("github-resync-all-btn").classList.toggle("hidden", !signedIn);
  el("github-add-project-btn").classList.toggle("hidden", !signedIn);
}

export async function openGithubPane() {
  stopPolling();
  openProjectId = null;
  el("github-board").classList.add("hidden");
  el("github-board-actions").classList.add("hidden");
  el("github-list-actions").classList.remove("hidden");
  el("github-back").classList.add("hidden");
  el("github-title").textContent = "GitHub";
  showView("github");
  await refreshAccountAndList();
}

async function refreshAccountAndList() {
  const account = await window.api.githubAccount().catch(() => null);
  setListMode(!!account);
  if (!account) return;
  projects = await window.api.githubProjectList().catch(() => []);
  renderProjectsList();
}

function renderProjectsList() {
  const list = el("github-projects-list");
  list.innerHTML = "";
  if (!projects.length) {
    list.appendChild(node("div", "grid-empty", "No boards yet. Add a project to sync one in."));
    return;
  }
  for (const p of projects) {
    const card = node("div", "card");
    card.appendChild(node("div", "card-title", p.title));
    card.appendChild(node("div", "card-sub", `${p.ownerLogin} #${p.number}`));
    card.onclick = () => void openBoard(p);
    list.appendChild(card);
  }
}

// --- Connect flow (device code) -----------------------------------------------

function bindDeviceModalCancel(onCancel: () => void) {
  (el("github-device-cancel") as unknown as HTMLButtonElement).onclick = onCancel;
}

async function connectGithub() {
  const modal = el("github-device-modal");
  let cancelled = false;
  bindDeviceModalCancel(() => {
    cancelled = true;
    modal.classList.add("hidden");
  });

  try {
    const start = await window.api.githubDeviceStart();
    (el("github-device-uri") as unknown as HTMLAnchorElement).textContent = start.verificationUri;
    (el("github-device-uri") as unknown as HTMLAnchorElement).href = start.verificationUri;
    el("github-device-code").textContent = start.userCode;
    modal.classList.remove("hidden");

    const result = await window.api.githubDeviceWait(start);
    if (cancelled) return;
    modal.classList.add("hidden");
    await refreshAccountAndList();
    void result; // { login } — surfaced via refreshAccountAndList() instead
  } catch (e) {
    modal.classList.add("hidden");
    if (!cancelled) alert((e as Error).message || "GitHub sign-in failed.");
  }
}

// --- Add project modal ---------------------------------------------------------

function openAddProjectModal() {
  const modal = el("github-add-project-modal");
  (el("github-add-owner") as unknown as HTMLInputElement).value = "";
  (el("github-add-number") as unknown as HTMLInputElement).value = "";
  const err = el("github-add-error");
  err.textContent = "";
  err.classList.add("hidden");
  modal.classList.remove("hidden");
}

async function confirmAddProject() {
  const owner = (el("github-add-owner") as unknown as HTMLInputElement).value.trim();
  const numberStr = (el("github-add-number") as unknown as HTMLInputElement).value.trim();
  const number = Number(numberStr);
  if (!owner || !Number.isFinite(number) || number < 1) {
    const err = el("github-add-error");
    err.textContent = "Enter an owner login and a project number.";
    err.classList.remove("hidden");
    return;
  }
  try {
    await window.api.githubProjectSync(owner, number);
    el("github-add-project-modal").classList.add("hidden");
    await refreshAccountAndList();
  } catch (e) {
    const err = el("github-add-error");
    err.textContent = (e as Error).message || "Could not sync that board.";
    err.classList.remove("hidden");
  }
}

// --- Board table -----------------------------------------------------------

async function openBoard(p: GithubProjectSummary) {
  openProjectId = p.id;
  el("github-list-actions").classList.add("hidden");
  el("github-board-actions").classList.remove("hidden");
  el("github-back").classList.remove("hidden");
  el("github-title").textContent = p.title;
  el("github-projects-list").classList.add("hidden");
  el("github-board").classList.remove("hidden");

  (el("github-back") as unknown as HTMLButtonElement).onclick = () => void openGithubPane();

  await pollBoard();
  stopPolling();
  pollTimer = setInterval(() => void pollBoard(), POLL_MS);
}

function fieldColumns(project: GithubBoardProject): GithubField[] {
  // Status-like fields first (single-select is what GitHub's board view
  // groups by), then everything else — text/number/date/iteration.
  return [...project.fields].sort((a, b) => {
    const rank = (f: GithubField) => (f.dataType === "SINGLE_SELECT" ? 0 : 1);
    return rank(a) - rank(b);
  });
}

function renderBoard(snapshot: GithubBoardSnapshot) {
  const head = el("github-board-head");
  const body = el("github-board-body");
  head.innerHTML = "";
  body.innerHTML = "";

  if (!snapshot.project) {
    el("github-board-status").textContent = "This board is no longer connected.";
    return;
  }

  const cols = fieldColumns(snapshot.project);
  head.appendChild(node("th", undefined, "Title"));
  head.appendChild(node("th", undefined, "Type"));
  for (const f of cols) head.appendChild(node("th", undefined, f.name));

  for (const item of snapshot.items) {
    const row = node("tr");
    const titleCell = node("td", "github-item-title", item.title);
    if (item.url) {
      const link = node("a", undefined, item.title) as unknown as HTMLAnchorElement;
      link.href = item.url;
      link.target = "_blank";
      link.rel = "noreferrer";
      titleCell.textContent = "";
      titleCell.appendChild(link);
    }
    row.appendChild(titleCell);
    row.appendChild(node("td", undefined, item.contentType));
    for (const f of cols) {
      const fv = item.fieldValues.find((v) => v.fieldId === f.id);
      row.appendChild(node("td", undefined, fv?.value != null ? String(fv.value) : ""));
    }
    body.appendChild(row);
  }

  el("github-board-status").textContent = `${snapshot.items.length} item${snapshot.items.length === 1 ? "" : "s"} · synced`;
}

async function pollBoard() {
  if (!openProjectId) return;
  const snapshot = await window.api.githubProjectSnapshot(openProjectId).catch(() => null);
  if (snapshot && openProjectId) renderBoard(snapshot);
}

async function addDraftItem() {
  if (!openProjectId) return;
  const title = prompt("Draft item title:");
  if (!title) return;
  await window.api.githubItemAddDraft(openProjectId, title).catch((e) => alert((e as Error).message));
  await pollBoard();
}

async function resyncAll() {
  await window.api.githubProjectResyncAll().catch(() => undefined);
  await refreshAccountAndList();
}

export function initGithubProjects() {
  (el("github-connect-btn") as unknown as HTMLButtonElement).onclick = () => void connectGithub();
  (el("github-add-project-btn") as unknown as HTMLButtonElement).onclick = openAddProjectModal;
  (el("github-add-cancel") as unknown as HTMLButtonElement).onclick = () =>
    el("github-add-project-modal").classList.add("hidden");
  (el("github-add-confirm") as unknown as HTMLButtonElement).onclick = () => void confirmAddProject();
  (el("github-resync-all-btn") as unknown as HTMLButtonElement).onclick = () => void resyncAll();
  (el("github-add-item-btn") as unknown as HTMLButtonElement).onclick = () => void addDraftItem();
  for (const btn of qsa("#sidebar-toggle-github")) {
    btn.onclick = () => document.body.classList.toggle("sidebar-collapsed");
  }
}
