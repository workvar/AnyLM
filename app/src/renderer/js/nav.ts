// Switches the main-area views and keeps the sidebar selection in sync.
import { el } from "./dom.js";
import { state } from "./state.js";

// Which sidebar button "owns" each view.
function navFor(view) {
  if (view === "projects" || view === "project") return "projects-nav";
  if (view === "convo") return state.mode === "project" ? "projects-nav" : null;
  return null;
}

export function showView(view) {
  state.view = view;
  el("projects-view").classList.toggle("hidden", view !== "projects");
  el("project-detail").classList.toggle("hidden", view !== "project");
  el("convo-view").classList.toggle("hidden", view !== "convo");
  el("settings-view").classList.toggle("hidden", view !== "settings");

  // Models/org/tools/skills live as panels inside #settings-view; visibility
  // is owned by settings-hub selectSettingsSection, not by showView.

  // Sidebar selected state (this was previously never updated).
  const active = navFor(view);
  for (const id of ["projects-nav"]) {
    const node = el(id);
    if (node) node.classList.toggle("active", id === active);
  }
}
