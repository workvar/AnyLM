// The composer's project chip: shows which project the open conversation
// belongs to and opens the project picker. Paint-only, so any module can sync
// it without pulling in the picker's dependencies.
import { el } from "./dom.js";
import { state } from "./state.js";

let onOpen: (() => void) | null = null;

export function setProjectChipHandler(fn: () => void) {
  onOpen = fn;
}

/** Project the open conversation lives in, or null for a standalone chat. */
export function currentProjectId(): string | null {
  return state.mode === "project" && state.current ? state.current.id : null;
}

/** A conversation with messages is committed to where it lives. */
export function conversationStarted(): boolean {
  return (state.chat?.length || 0) > 0;
}

export function syncProjectChip() {
  const wrap = el("project-picker");
  const trigger = el("project-trigger");
  if (!wrap || !trigger) return;

  const inConvo = state.mode === "chat" || state.mode === "project";
  wrap.classList.toggle("hidden", !inConvo);
  if (!inConvo) return;

  const name = state.mode === "project" ? state.current?.name || "Untitled project" : "";
  const label = name || "No project";
  el("project-current").textContent = label;
  trigger.classList.toggle("assigned", !!name);

  const started = conversationStarted();
  trigger.classList.toggle("disabled", started);
  trigger.setAttribute("aria-disabled", String(started));
  trigger.setAttribute("aria-label", `Project: ${label}`);
  trigger.title = started
    ? `${label}. A chat can only be moved before its first message.`
    : "Choose a project for this chat";
}

export function initProjectChip() {
  const trigger = el("project-trigger");
  if (!trigger) return;
  trigger.onclick = (e) => {
    e.stopPropagation();
    if (conversationStarted()) return;
    onOpen?.();
  };
}
