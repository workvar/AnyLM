// Per-project chat threads: separate conversations inside one project that
// share the project's instructions + context but keep their own history.
import { el, node } from "./dom.js";
import { state } from "./state.js";
import { renderHistory } from "./convo.js";
import { getSelectedModel } from "./dropdown.js";
import { estimateContext } from "./contextmeter.js";

export async function loadProjectThreads() {
  state.threads = await window.api.listThreads(state.current.id);
  if (!state.threads.length) {
    await window.api.createThread(state.current.id, { title: "New chat" });
    state.threads = await window.api.listThreads(state.current.id);
  }
  await selectThread(state.threads[0].id);
}

export async function selectThread(threadId) {
  state.thread = await window.api.getThread(state.current.id, threadId);
  state.chat = (state.thread.messages || []).map((m) => ({ ...m }));
  renderHistory(state.chat);
  renderThreadBar();
  estimateContext(getSelectedModel(), state.chat);
}

export async function createProjectThread() {
  const t = await window.api.createThread(state.current.id, { title: "New chat" });
  state.threads = await window.api.listThreads(state.current.id);
  await selectThread(t.id);
}

// New thread pre-seeded with messages (used by the compact action).
export async function newThreadSeeded(messages, title) {
  const t = await window.api.createThread(state.current.id, { title: title || "New chat" });
  await window.api.updateThread(state.current.id, t.id, { messages, title });
  state.threads = await window.api.listThreads(state.current.id);
  await selectThread(t.id);
}

async function removeThread(threadId) {
  await window.api.deleteThread(state.current.id, threadId);
  state.threads = await window.api.listThreads(state.current.id);
  if (!state.threads.length) {
    await window.api.createThread(state.current.id, { title: "New chat" });
    state.threads = await window.api.listThreads(state.current.id);
  }
  const active = state.thread && state.threads.some((t) => t.id === state.thread.id);
  await selectThread(active ? state.thread.id : state.threads[0].id);
}

export function renderThreadBar() {
  const bar = el("thread-bar");
  bar.innerHTML = "";
  for (const t of state.threads) {
    const active = state.thread && t.id === state.thread.id;
    const pill = node("button", "thread-pill" + (active ? " active" : ""));
    pill.type = "button";
    pill.appendChild(node("span", "thread-title", t.title || "New chat"));
    const x = node("span", "thread-x", "×");
    x.onclick = (e) => {
      e.stopPropagation();
      removeThread(t.id);
    };
    pill.appendChild(x);
    pill.onclick = () => selectThread(t.id);
    bar.appendChild(pill);
  }
  const add = node("button", "thread-add", "+ New chat");
  add.type = "button";
  add.onclick = createProjectThread;
  bar.appendChild(add);
}

// Persist the active thread after a turn; auto-title from the first message.
export async function persistProjectThread() {
  if (state.mode !== "project" || !state.thread) return;
  const patch = { messages: state.chat };
  if (!state.thread.title || state.thread.title === "New chat") {
    const firstUser = state.chat.find((m) => m.role === "user");
    if (firstUser && firstUser.content) patch.title = firstUser.content.slice(0, 40);
  }
  state.thread = { ...state.thread, ...patch };
  await window.api.updateThread(state.current.id, state.thread.id, patch);
  state.threads = await window.api.listThreads(state.current.id);
  renderThreadBar();
}
