import { el } from "./dom.js";
import { state } from "./state.js";

let useTools = false;

export function getUseTools(): boolean {
  return useTools;
}

export function setUseTools(on: boolean, { persist = true } = {}): void {
  useTools = !!on;
  const toggle = el("tools-toggle");
  if (toggle) {
    toggle.classList.toggle("active", useTools);
    toggle.title = useTools ? "Tools enabled for this chat" : "Let the model use tools";
  }
  if (persist) void persistConversationPatch({ useTools });
}

async function persistConversationPatch(patch: Record<string, unknown>): Promise<void> {
  if (state.mode === "chat" && state.current) {
    state.current = { ...state.current, ...patch };
    await window.api.updateChat(state.current.id, patch);
  } else if (state.mode === "project" && state.current && state.thread) {
    state.thread = { ...state.thread, ...patch };
    await window.api.updateThread(state.current.id, state.thread.id, patch);
  }
}
