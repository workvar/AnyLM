// Shared conversation-view controller used by both projects and standalone
// chats. Keeps the single chat pane in sync with whichever item is active.
import { el } from "./dom.js";
import { state } from "./state.js";
import { setModelDropdown, setModelDropdownEnabled } from "./dropdown.js";
import { modelLockPopoverMessage } from "./model-lock-message.js";
import { clearMessages, addMessage, setBubbleMarkdown } from "./views.js";
import { hideContext } from "./contextmeter.js";
import { showView } from "./nav.js";
import { appendAskAnswered } from "./turns.js";
import { renderFileCard } from "./file-cards.js";
import { paintCollapsed, createTrailHost } from "./activity-trail.js";
import { paintAgentTrail } from "./agent-trail.js";

export function showEmpty() {
  state.mode = null;
  state.current = null;
  state.thread = null;
  state.chat = [];
  clearMessages();
  hideContext();
  showView("projects");
}

// Configure and reveal the conversation view for a project thread or chat.
export function openConvo({ mode, name, model, modelLocked, placeholder }) {
  state.mode = mode;
  showView("convo");
  el("convo-name").value = name || "";
  setModelDropdown(state.models, model);
  const message = modelLockPopoverMessage({
    started: false,
    projectLocked: !!modelLocked,
  });
  setModelDropdownEnabled(!modelLocked, message);
  el("chat-input").placeholder = placeholder || "Message…";
}

// Model can only change on a fresh conversation. Once it has messages (or the
// project locks its model) the composer picker is disabled.
export function updateModelLock() {
  const projectLocked = state.mode === "project" && !!state.current?.modelLocked;
  const started = (state.chat?.length || 0) > 0;
  const enabled = !projectLocked && !started;
  const message = modelLockPopoverMessage({ started, projectLocked });
  setModelDropdownEnabled(enabled, message);
}

// Render a saved message history (assistant messages as markdown).
export async function renderHistory(messages) {
  clearMessages();
  for (const m of messages || []) {
    if (m.role === "artifact" && m.type === "file") {
      const missing = !(await window.api.pfilesExists(m.dir, m.name));
      await renderFileCard(m, { missing });
      continue;
    }
    if (m.role === "ask") {
      appendAskAnswered(m.question, m.answer);
      continue;
    }
    if (m.role === "assistant") {
      if (m.activity) {
        const host = createTrailHost();
        el("messages").appendChild(host);
        paintCollapsed(host, m.activity);
        // Same as live turns (see turns.ts collapseTrail): restore the
        // agent-trail summary alongside the collapsed trail so reopening a
        // chat doesn't silently lose it.
        paintAgentTrail(host, m.activity.events || []);
      }
      const bubble = addMessage("assistant", "");
      setBubbleMarkdown(bubble, m.content);
    } else {
      addMessage(m.role, m.content);
    }
  }
  el("messages").scrollTop = el("messages").scrollHeight;
}
