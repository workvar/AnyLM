// Standalone chats: select, create, archive, and persistence. These appear in
// the global recents list alongside project threads.
import { el } from "./dom.js";
import { state } from "./state.js";
import { getSelectedModel } from "./dropdown.js";
import { openConvo, renderHistory, showEmpty, updateModelLock } from "./convo.js";
import { estimateContext } from "./contextmeter.js";
import { loadRecents } from "./recents.js";
import { maybeTitle } from "./titler.js";
import { paintRecentsTitle } from "./views.js";
import { detachAll, attachTurn } from "./turns.js";

export async function selectChat(id) {
  detachAll();
  state.current = await window.api.getChat(id);
  state.chat = (state.current.messages || []).map((m) => ({ ...m }));
  openConvo({
    mode: "chat",
    name: state.current.title,
    model: state.current.model,
    modelLocked: false,
    placeholder: "Message…",
  });
  await renderHistory(state.chat);
  attachTurn(`chat:${id}`);
  estimateContext(state.current.model, state.chat);
  updateModelLock();
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

// Persist the current chat's messages after a turn, then auto-title (via an
// LLM summary) while the chat is still untitled.
export async function persistCurrentChat() {
  if (state.mode !== "chat" || !state.current) return;
  await window.api.updateChat(state.current.id, { messages: state.chat });
  state.current = { ...state.current, messages: state.chat };
  await loadRecents();

  const title = await maybeTitle(state.current.model, state.chat, state.current.title);
  if (title && state.mode === "chat" && state.current) {
    state.current = { ...state.current, title };
    await window.api.updateChat(state.current.id, { title });
    if (state.view === "convo") el("convo-name").value = title;
    paintRecentsTitle(`chat:${state.current.id}`, title);
  }
}
