// Left rail: search filters the flat Chats list below.
import { el } from "../dom.js";
import { loadRecents } from "../recents.js";

let searchTimer;

export function initSidebar() {
  const search = el("sidebar-search");
  if (!search) return;
  search.oninput = () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => loadRecents(), 180);
  };
}
