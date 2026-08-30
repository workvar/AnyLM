// Per-project chat threads: separate conversations inside one project that
// share the project's instructions + context but keep their own history.
import { el } from "./dom.js";
import { state } from "./state.js";
import {
  openConvo,
  renderHistory,
  updateModelLock,
  saveActiveConvoView,
  invalidateConvo,
} from "./convo.js";
import { getSelectedModel } from "./dropdown.js";
import { estimateContext } from "./contextmeter.js";
import { loadRecents } from "./recents.js";
import { detachAll, attachTurn } from "./turns.js";
import { resetRail } from "./rail/index.js";
import { setUseTools } from "./tools-toggle.js";
import { resetWebResearchHintDismiss } from "./web-research-hint.js";
import { syncMenuContext } from "./menu-context.js";

// Fetch (or initialise) the active project's threads without opening one.
export async function fetchThreads() {
  state.threads = await window.api.listThreads(state.current.id);
  if (!state.threads.length) {
    await window.api.createThread(state.current.id, { title: "New chat" });
    state.threads = await window.api.listThreads(state.current.id);
  }
  return state.threads;
}

// Open a thread in the conversation view.
export async function openThread(threadId) {
  // Park the outgoing conversation's rendered view before `state` moves on.
  saveActiveConvoView();
  detachAll();
  resetRail();
  state.thread = await window.api.getThread(state.current.id, threadId);
  state.chat = (state.thread.messages || []).map((m) => ({ ...m }));
  openConvo({
    mode: "project",
    name: state.thread.title,
    model: state.current.model,
    modelLocked: !!state.current.modelLocked,
    placeholder: "Message your project model…",
  });
  await renderHistory(state.chat, `thread:${threadId}`);
  attachTurn(`thread:${threadId}`);
  estimateContext(state.current.model, state.chat);
  updateModelLock();
  setUseTools(!!state.thread.useTools);
  resetWebResearchHintDismiss();
  syncMenuContext();
  // Repaint recents so this thread shows as the selected item in the sidebar.
  await loadRecents();
}

export async function createProjectThread() {
  const t = await window.api.createThread(state.current.id, { title: "New chat" });
  await fetchThreads();
  await openThread(t.id);
}

// New thread pre-seeded with messages (used by the compact action).
export async function newThreadSeeded(messages, title) {
  const t = await window.api.createThread(state.current.id, { title: title || "New chat" });
  await window.api.updateThread(state.current.id, t.id, { messages, title });
  await fetchThreads();
  await openThread(t.id);
}

let nameTimer;
export function scheduleThreadName() {
  clearTimeout(nameTimer);
  nameTimer = setTimeout(saveThreadName, 400);
}
async function saveThreadName() {
  if (state.mode !== "project" || !state.thread) return;
  const title = el("convo-name").value || "New chat";
  state.thread = { ...state.thread, title };
  await window.api.updateThread(state.current.id, state.thread.id, { title });
  state.threads = await window.api.listThreads(state.current.id);
  await loadRecents();
}

// Archive a thread (hidden, not deleted).
export async function archiveThread(projectId, threadId) {
  invalidateConvo(`thread:${threadId}`);
  await window.api.updateThread(projectId, threadId, { archived: true });
  await loadRecents();
}
