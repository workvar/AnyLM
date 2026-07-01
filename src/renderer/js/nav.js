// Switches the four main-area views: projects grid, a project's chats, convo, models.
import { el } from "./dom.js";
import { state } from "./state.js";

export function showView(view) {
  state.view = view;
  el("projects-view").classList.toggle("hidden", view !== "projects");
  el("project-detail").classList.toggle("hidden", view !== "project");
  el("convo-view").classList.toggle("hidden", view !== "convo");
  el("models-view").classList.toggle("hidden", view !== "models");
}
