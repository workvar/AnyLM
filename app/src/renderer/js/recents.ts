// Global recent conversations in the sidebar: standalone chats + project
// threads, newest first, independent of which project is open.
import { el } from "./dom.js";
import { state } from "./state.js";
import { renderRecents } from "./views.js";
import { showMenu } from "./menu.js";
import { selectChat, archiveChat } from "./chats.js";
import { openRecentThread } from "./projects.js";
import { archiveThread } from "./threads.js";
import { activeKey, paintActivity } from "./activity.js";

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
  const query = String(state.sidebarQuery || "").trim().toLowerCase();
  const all = await window.api.recentsList(query ? 200 : 40);
  state.recents = query
    ? all.filter((it) => String(it.title || "").toLowerCase().includes(query))
    : all;
  const label = el("side-chats-label");
  if (label) label.textContent = query ? "Matching chats" : "Chats";
  renderRecents(state.recents, activeKey(), { onOpen: openItem, onMenu: menuFor });
  paintActivity(); // rows were just replaced; repaint working / waiting dots
}
