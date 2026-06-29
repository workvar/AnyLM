// Shared conversation-view controller used by both projects and standalone
// chats. Keeps the single chat pane in sync with whichever item is active.
import { el } from "./dom.js";
import { state } from "./state.js";
import { setModelDropdown, setModelDropdownEnabled } from "./dropdown.js";
import { clearMessages, addMessage, setBubbleMarkdown } from "./views.js";
import { hideContext } from "./contextmeter.js";

export function showEmpty() {
  state.mode = null;
  state.current = null;
  state.thread = null;
  state.chat = [];
  clearMessages();
  hideContext();
  el("convo-view").classList.add("hidden");
  el("empty-state").classList.remove("hidden");
}

// Configure and reveal the conversation view for a project or chat.
export function openConvo({ mode, name, model, modelLocked, showProjectBtn, placeholder }) {
  state.mode = mode;
  el("empty-state").classList.add("hidden");
  el("convo-view").classList.remove("hidden");
  el("convo-name").value = name || "";
  setModelDropdown(state.models, model);
  setModelDropdownEnabled(!modelLocked);
  el("project-settings-btn").classList.toggle("hidden", !showProjectBtn);
  // Thread bar is project-only.
  el("thread-bar").classList.toggle("hidden", !showProjectBtn);
  el("chat-input").placeholder = placeholder || "Message…";
}

// Render a saved message history (assistant messages as markdown).
export function renderHistory(messages) {
  clearMessages();
  for (const m of messages || []) {
    if (m.role === "assistant") {
      setBubbleMarkdown(addMessage("assistant", ""), m.content);
    } else {
      addMessage(m.role, m.content);
    }
  }
  el("messages").scrollTop = el("messages").scrollHeight;
}
