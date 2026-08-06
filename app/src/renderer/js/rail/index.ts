// Right rail controller: Progress, Skills and Context alongside the chat.
// Owns the collapse state and the subscriptions that feed the three panels.
import { el, qsa } from "../dom.js";
import { startStep, finishStep, noteStep, resetProgress } from "./progress.js";
import { refreshSkills } from "./skills-panel.js";
import { setTurnContext, refreshContext, resetContext } from "./context-panel.js";

function toggleRail() {
  const collapsed = el("app").classList.toggle("rail-collapsed");
  window.api.setSettings({ railCollapsed: collapsed });
}

let bound = false;

export function initRail(settings) {
  if (bound) return;
  bound = true;
  if (settings && settings.railCollapsed) el("app").classList.add("rail-collapsed");
  el("rail-toggle").onclick = toggleRail;

  // Collapsible groups.
  for (const head of qsa(".rail-head")) {
    head.onclick = () => head.parentElement.classList.toggle("collapsed");
  }

  window.api.onActivity((e) => {
    if (e.kind === "tool" && e.status === "running") {
      startStep(e.name, e.label, e.detail || "");
    } else if (e.kind === "tool" && e.status === "done") {
      finishStep(e.name, String(e.output || "").split("\n")[0].slice(0, 90));
    }
  });

  window.api.onFileGenerated(({ name }) => noteStep(`Wrote ${name}`));
  window.api.onChatContext((ctx) => setTurnContext(ctx));

  refreshSkills();
  refreshContext();
}

// Called when a conversation is opened: the rail is per-conversation.
export function resetRail() {
  resetProgress();
  resetContext();
  refreshSkills();
}

export { refreshSkills, refreshContext };
