// Switches the main-area views and keeps the sidebar selection in sync.
import { el } from "./dom.js";
import { state } from "./state.js";

// Which sidebar button "owns" each view.
function navFor(view) {
  if (view === "projects" || view === "project") return "projects-nav";
  if (view === "convo") return state.mode === "project" ? "projects-nav" : null;
  if (view === "models") return "models-nav";
  if (view === "org") return "org-nav";
  if (view === "tools") return "tools-nav";
  if (view === "skills") return "skills-nav";
  return null;
}

export function showView(view) {
  state.view = view;
  el("projects-view").classList.toggle("hidden", view !== "projects");
  el("project-detail").classList.toggle("hidden", view !== "project");
  el("convo-view").classList.toggle("hidden", view !== "convo");
  el("models-view").classList.toggle("hidden", view !== "models");
  el("org-view").classList.toggle("hidden", view !== "org");
  el("tools-view").classList.toggle("hidden", view !== "tools");
  el("skills-view").classList.toggle("hidden", view !== "skills");

  // Sidebar selected state (this was previously never updated).
  const active = navFor(view);
  for (const id of ["projects-nav", "models-nav", "org-nav", "tools-nav", "skills-nav"]) {
    el(id).classList.toggle("active", id === active);
  }
}
