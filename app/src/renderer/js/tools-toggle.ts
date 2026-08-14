import { el } from "./dom.js";
import { state } from "./state.js";
import {
  captureConversationTarget,
  isCurrentTarget,
  persistConversationPatch,
  type ConversationTarget,
} from "./conversation-target.js";
import { promptToolsScope } from "./tools-scope-prompt.js";
import { show as showToast } from "./updates/toast.js";

let useTools = false;

export function getUseTools(): boolean {
  return useTools;
}

/**
 * UI only: paints the button. Never persists. Every write goes through
 * setConversationUseTools so chats and project threads behave identically.
 */
export function setUseTools(on: boolean): void {
  useTools = !!on;
  const toggle = el("tools-toggle");
  if (!toggle) return;
  toggle.classList.toggle("active", useTools);
  const label = useTools ? "Tools enabled" : "Enable tools";
  toggle.title = label;
  toggle.setAttribute("aria-label", label);
}

/**
 * Turn tools on/off for one conversation. Same rules in a standalone chat and
 * in a project thread: the toggle only ever changes the conversation the user
 * is in. Choosing "all new" additionally moves the default for future
 * conversations; it never rewrites existing ones.
 */
export async function toggleUseTools(): Promise<void> {
  const turningOn = !getUseTools();
  const target = captureConversationTarget();

  // No active conversation: paint the button and stop (should be rare).
  if (!target) {
    setUseTools(turningOn);
    return;
  }

  try {
    const choice = await promptToolsScope(turningOn ? "enable" : "disable", target.mode);
    if (choice === "cancel") return;
    if (choice === "all-new") await setDefaultUseTools(target, turningOn);
    await setConversationUseTools(target, turningOn);
  } catch {
    showToast({ title: "Couldn't update tools", msg: "Try again." });
  }
}

export async function setConversationUseTools(
  target: ConversationTarget,
  on: boolean
): Promise<void> {
  await persistConversationPatch(target, { useTools: on });
  if (isCurrentTarget(target)) setUseTools(on);
}

async function setDefaultUseTools(target: ConversationTarget, on: boolean): Promise<void> {
  if (target.mode === "chat") {
    await window.api.setSettings({ defaultUseToolsForChats: on });
    return;
  }
  const updated = await window.api.setProjectDefaultUseTools(target.projectId, on);
  if (!updated) throw new Error("Project tools update returned no project");
  if (state.mode === "project" && state.current?.id === target.projectId) {
    state.current = { ...state.current, ...updated };
  }
}
