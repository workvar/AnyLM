// Left rail: search filters the flat Chats list below.
import { el } from "../dom.js";
import { state } from "../state.js";
import { loadRecents } from "../recents.js";

let searchTimer: ReturnType<typeof setTimeout> | undefined;

function readQuery(search: UiElement): string {
  return String(search.value ?? "");
}

function onSearch(search: UiElement) {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.sidebarQuery = readQuery(search);
    void loadRecents();
  }, 180);
}

export function initSidebar() {
  const search = el("sidebar-search");
  if (!search) return;

  // Native input + AWC md-text-field (mdInput).
  search.oninput = () => onSearch(search);
  search.addEventListener("mdInput", () => onSearch(search));
}
