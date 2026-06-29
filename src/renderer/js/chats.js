// Standalone chats: list, select, create, delete, and persistence.
import { el } from "./dom.js";
import { state } from "./state.js";
import { renderChatList } from "./views.js";
import { getSelectedModel } from "./dropdown.js";
import { openConvo, renderHistory, showEmpty } from "./convo.js";
import { estimateContext } from "./contextmeter.js";

export async function loadChats() {
  state.chats = await window.api.listChats();
  const activeId = state.mode === "chat" ? state.current?.id : null;
  renderChatList(state.chats, activeId, selectChat);
}

export async function selectChat(id) {
  state.current = await window.api.getChat(id);
  state.chat = (state.current.messages || []).map((m) => ({ ...m }));
  openConvo({
    mode: "chat",
    name: state.current.title,
    model: state.current.model,
    modelLocked: false,
    showProjectBtn: false,
    placeholder: "Message…",
  });
  renderHistory(state.chat);
  estimateContext(state.current.model, state.chat);
  renderChatList(state.chats, id, selectChat);
}

export async function createChat() {
  const c = await window.api.createChat({ title: "New chat", model: state.models[0] || "" });
  await loadChats();
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
  await loadChats();
  await selectChat(c.id);
}

export async function deleteCurrentChat() {
  if (!state.current) return;
  await window.api.deleteChat(state.current.id);
  showEmpty();
  await loadChats();
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
  await loadChats();
}

export async function saveChatModel() {
  if (state.mode !== "chat" || !state.current) return;
  const patch = { model: getSelectedModel() };
  state.current = { ...state.current, ...patch };
  await window.api.updateChat(state.current.id, patch);
  await loadChats();
}

// Persist the current chat's messages after a turn; auto-title from first message.
export async function persistCurrentChat() {
  if (state.mode !== "chat" || !state.current) return;
  const patch = { messages: state.chat };
  if (!state.current.title || state.current.title === "New chat") {
    const firstUser = state.chat.find((m) => m.role === "user");
    if (firstUser) patch.title = firstUser.content.slice(0, 40);
  }
  state.current = { ...state.current, ...patch };
  await window.api.updateChat(state.current.id, patch);
  el("convo-name").value = state.current.title;
  await loadChats();
}
