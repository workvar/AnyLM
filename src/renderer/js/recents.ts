// Global recent conversations in the sidebar: standalone chats + project
// threads, newest first, independent of which project is open.
import { el } from "./dom.js";
import { state } from "./state.js";
import { renderRecents } from "./views.js";
import { showMenu } from "./menu.js";
import { selectChat, archiveChat } from "./chats.js";
import { openRecentThread } from "./projects.js";
import { archiveThread } from "./threads.js";

function activeKey() {
  if (state.mode === "chat" && state.current) return `chat:${state.current.id}`;
  if (state.mode === "project" && state.thread) return `thread:${state.thread.id}`;
  return null;
}

function openItem(it) {
  if (it.kind === "chat") return selectChat(it.id);
  return openRecentThread(it.projectId, it.id);
}

function menuFor(it, x, y) {
  showMenu(x, y, [
    { label: "Open", onClick: () => openItem(it) },
    {
      label: "Archive",
      danger: true,
      onClick: () =>
        it.kind === "chat" ? archiveChat(it.id) : archiveThread(it.projectId, it.id),
    },
  ]);
}

export async function loadRecents() {
  const search = el("sidebar-search");
  const query = String(search?.value || "").trim().toLowerCase();
  const all = await window.api.recentsList(query ? 200 : 40);
  state.recents = query
    ? all.filter((it) => String(it.title || "").toLowerCase().includes(query))
    : all;
  const label = el("side-chats-label");
  if (label) label.textContent = query ? "Matching chats" : "Chats";
  renderRecents(state.recents, activeKey(), { onOpen: openItem, onMenu: menuFor });
}
