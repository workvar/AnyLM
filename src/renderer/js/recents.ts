// Global recent conversations in the sidebar: standalone chats + project
// threads, newest first, independent of which project is open.
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
  state.recents = await window.api.recentsList(40);
  renderRecents(state.recents, activeKey(), { onOpen: openItem, onMenu: menuFor });
}
