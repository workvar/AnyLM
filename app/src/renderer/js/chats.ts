// Standalone chats: select, create, archive, and persistence. These appear in
// the global recents list alongside project threads.
import { el } from "./dom.js";
import { state } from "./state.js";
import { getSelectedModel } from "./dropdown.js";
import {
  openConvo,
  renderHistory,
  showEmpty,
  updateModelLock,
  saveActiveConvoView,
  invalidateConvo,
} from "./convo.js";
import { estimateContext } from "./contextmeter.js";
import { loadRecents } from "./recents.js";
import { detachAll, attachTurn } from "./turns.js";
import { resetRail } from "./rail/index.js";
import { setUseTools } from "./tools-toggle.js";
import { resetWebResearchHintDismiss } from "./web-research-hint.js";
import { syncMenuContext } from "./menu-context.js";

export async function selectChat(id) {
  // Park the outgoing conversation's rendered view before anything in `state`
  // moves to the new one.
  saveActiveConvoView();
  detachAll();
  resetRail();
  state.current = await window.api.getChat(id);
  state.chat = (state.current.messages || []).map((m) => ({ ...m }));
  openConvo({
    mode: "chat",
    name: state.current.title,
    model: state.current.model,
    modelLocked: false,
    placeholder: "Message…",
  });
  await renderHistory(state.chat, `chat:${id}`);
  attachTurn(`chat:${id}`);
  estimateContext(state.current.model, state.chat);
  updateModelLock();
  setUseTools(!!state.current.useTools);
  resetWebResearchHintDismiss();
  syncMenuContext();
  await loadRecents();
}

export async function createChat() {
  const model = state.lastModel || state.models[0] || "";
  const c = await window.api.createChat({ title: "New chat", model });
  await selectChat(c.id);
  el("convo-name").focus();
}

// New chat pre-seeded with messages (used by the compact action).
export async function newChatSeeded(messages, title) {
  const c = await window.api.createChat({
    title: title || "New chat",
    model: state.current?.model || state.models[0] || "",
  });
  await window.api.updateChat(c.id, { messages, title });
  await selectChat(c.id);
}

// Archive a chat (hidden, not deleted).
export async function archiveChat(id) {
  invalidateConvo(`chat:${id}`);
  await window.api.updateChat(id, { archived: true });
  if (state.mode === "chat" && state.current?.id === id) showEmpty();
  await loadRecents();
}

let nameTimer;
export function scheduleChatName() {
  clearTimeout(nameTimer);
  nameTimer = setTimeout(saveChatName, 400);
}
async function saveChatName() {
  if (state.mode !== "chat" || !state.current) return;
  const patch = { title: el("convo-name").value || "New chat" };
  state.current = { ...state.current, ...patch };
  await window.api.updateChat(state.current.id, patch);
  await loadRecents();
}

export async function saveChatModel() {
  if (state.mode !== "chat" || !state.current) return;
  const patch = { model: getSelectedModel() };
  state.current = { ...state.current, ...patch };
  await window.api.updateChat(state.current.id, patch);
  // Remember this choice so the next new chat defaults to it.
  state.lastModel = patch.model;
  await window.api.setSettings({ lastModel: patch.model });
}
