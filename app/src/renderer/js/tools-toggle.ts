import { el } from "./dom.js";
import { state } from "./state.js";
import { promptToolsScope } from "./tools-scope-prompt.js";
import { show as showToast } from "./updates/toast.js";

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

  try {
    if (state.mode === "project" && state.current) {
      const projectId = state.current.id;
      const threadId = state.thread?.id;
      const updated = await window.api.setProjectDefaultUseTools(projectId, turningOn);
      if (!updated) throw new Error("Project tools update returned no project");
      if (
        state.mode !== "project" ||
        state.current?.id !== projectId ||
        state.thread?.id !== threadId
      ) {
        return;
      }
      state.current = { ...state.current, ...updated };
      if (state.thread) state.thread = { ...state.thread, useTools: turningOn };
      setUseTools(turningOn, { persist: false });
      return;
    }

    if (state.mode === "chat" && state.current) {
      const chatId = state.current.id;
      if (turningOn) {
        const choice = await promptToolsScope("enable");
        if (choice === "cancel") return;
        if (choice === "all-new") {
          await window.api.setSettings({ defaultUseToolsForChats: true });
        }
        await persistChatUseTools(chatId, true);
        return;
      }

      const settings = await window.api.getSettings();
      if (settings.defaultUseToolsForChats) {
        const choice = await promptToolsScope("disable-default");
        if (choice === "cancel") return;
        if (choice === "all-new") {
          await window.api.setSettings({ defaultUseToolsForChats: false });
        }
        await persistChatUseTools(chatId, false);
        return;
      }

      await persistChatUseTools(chatId, false);
      return;
    }

    // No active conversation: toggle UI only (should be rare)
    setUseTools(turningOn, { persist: false });
  } catch {
    showToast({ title: "Couldn't update tools", msg: "Try again." });
  }
}

async function persistChatUseTools(chatId: string, on: boolean): Promise<void> {
  await window.api.updateChat(chatId, { useTools: on });
  if (state.mode !== "chat" || state.current?.id !== chatId) return;
  state.current = { ...state.current, useTools: on };
  setUseTools(on, { persist: false });
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
