// Keep the native File menu's "New Chat in {project}" label in sync.
import { state } from "./state.js";

function projectForMenu(): { id: string; name: string } | null {
  if (state.mode === "project" && state.current?.id) {
    return { id: state.current.id, name: state.current.name || "Untitled project" };
  }
  if (state.view === "project" && state.viewProject?.id) {
    return {
      id: state.viewProject.id,
      name: state.viewProject.name || "Untitled project",
    };
  }
  return null;
}

export function syncMenuContext(): void {
  const p = projectForMenu();
  window.api.setMenuContext(
    p ? { projectId: p.id, projectName: p.name } : { projectId: null, projectName: null }
  );
}

export function currentMenuProject(): { id: string; name: string } | null {
  return projectForMenu();
}
