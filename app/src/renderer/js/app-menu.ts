// Wire native application-menu actions into renderer navigation / creation.
import { el } from "./dom.js";
import { createChat } from "./chats.js";
import { createProject, openProject, loadProjects } from "./projects.js";
import { createProjectThread } from "./threads.js";
import { openSettingsHub } from "./settings-hub.js";
import { showView } from "./nav.js";
import { syncMenuContext, currentMenuProject } from "./menu-context.js";

function focusSidebarSearch(): void {
  const input = el("sidebar-search");
  if (!input) return;
  el("app")?.classList.remove("sidebar-collapsed");
  input.focus();
  input.select?.();
}

function toggleSidebar(): void {
  const collapsed = el("app").classList.toggle("sidebar-collapsed");
  window.api.setSettings({ sidebarCollapsed: collapsed });
}

function toggleRail(): void {
  const collapsed = el("app").classList.toggle("rail-collapsed");
  window.api.setSettings({ railCollapsed: collapsed });
}

async function newProjectChat(): Promise<void> {
  const p = currentMenuProject();
  if (!p) return;
  await openProject(p.id);
  await createProjectThread();
}

export function initAppMenu(): void {
  syncMenuContext();
  window.api.onMenuAction((msg) => {
    const action = msg && msg.action;
    if (action === "settings") openSettingsHub("general");
    else if (action === "settings-section") openSettingsHub(String(msg.section || "general"));
    else if (action === "new-chat") createChat();
    else if (action === "new-project-chat") newProjectChat();
    else if (action === "new-project") createProject();
    else if (action === "search") focusSidebarSearch();
    else if (action === "sidebar") toggleSidebar();
    else if (action === "rail") toggleRail();
    else if (action === "check-updates") window.api.checkForUpdate();
    else if (action === "projects") {
      showView("projects");
      loadProjects();
      syncMenuContext();
    }
  });
}

export { syncMenuContext } from "./menu-context.js";
