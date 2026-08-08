import { el } from "./dom.js";
import { state } from "./state.js";
import { promptToolsScope } from "./tools-scope-prompt.js";

let useTools = false;

export function getUseTools(): boolean {
  return useTools;
}

export function setUseTools(on: boolean, { persist = true } = {}): void {
  useTools = !!on;
  const toggle = el("tools-toggle");
  if (toggle) {
    toggle.classList.toggle("active", useTools);
    const label = useTools ? "Tools enabled" : "Enable tools";
    toggle.title = label;
    toggle.setAttribute("aria-label", label);
  }
  if (persist) void persistConversationPatch({ useTools });
}

export async function toggleUseTools(): Promise<void> {
  const turningOn = !getUseTools();

  if (state.mode === "project" && state.current) {
    const updated = await window.api.setProjectDefaultUseTools(state.current.id, turningOn);
    if (!updated) return;
    state.current = { ...state.current, ...updated };
    if (state.thread) state.thread = { ...state.thread, useTools: turningOn };
    setUseTools(turningOn, { persist: false });
    return;
  }

  if (state.mode === "chat" && state.current) {
    if (turningOn) {
      const choice = await promptToolsScope("enable");
      if (choice === "cancel") return;
      if (choice === "all-new") {
        await window.api.setSettings({ defaultUseToolsForChats: true });
      }
      setUseTools(true);
      return;
    }

    const settings = await window.api.getSettings();
    if (settings.defaultUseToolsForChats) {
      const choice = await promptToolsScope("disable-default");
      if (choice === "cancel") return;
      if (choice === "all-new") {
        await window.api.setSettings({ defaultUseToolsForChats: false });
      }
      setUseTools(false);
      return;
    }

    setUseTools(false);
    return;
  }

  // No active conversation: toggle UI only (should be rare)
  setUseTools(turningOn, { persist: false });
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
