// Chat sending and streaming.
import { el } from "./dom.js";
import { state } from "./state.js";
import { addMessage, addUserMessage } from "./views.js";
import { updateModelLock } from "./convo.js";
import { getSelectedModel } from "./dropdown.js";
import { persistCurrentChat } from "./chats.js";
import { persistProjectThread } from "./threads.js";
import { getAttachments, getImageThumbs, hasAttachments, clearAttachments } from "./attach.js";
import { showDocConfirm } from "./file-cards.js";
import { llmMessages } from "./messages.js";
import { activeKey } from "./activity.js";
import {
  runTurn,
  answerFromComposer,
  stopTurn,
  handleFileGenerated,
  clearPendingConfirm,
} from "./turns.js";
import { getUseTools, toggleUseTools } from "./tools-toggle.js";
import { syncWebResearchHint } from "./web-research-hint.js";

// Governance policy warnings (redactions, near-limit notices) surfaced inline.
let govBound = false;
function bindGovernanceNotes() {
  if (govBound) return;
  govBound = true;
  window.api.onGovernance(({ warnings }) => {
    if (!warnings || !warnings.length) return;
    const wrap = el("messages");
    for (const w of warnings) {
      const note = document.createElement("div");
      note.className = "gov-note";
      note.textContent = `⚖ ${w}`;
      wrap.appendChild(note);
    }
    wrap.scrollTop = wrap.scrollHeight;
  });
}

// --- Tools: per-chat toggle, inline activity, risky-run confirmations ---

let toolsBound = false;

export function initToolUse() {
  if (toolsBound) return;
  toolsBound = true;

  const toggle = el("tools-toggle");
  toggle.onclick = () => {
    void toggleUseTools();
  };

  // Document generation keeps the inline file-card permission UI. Other risky
  // tools confirm via the activity trail + Working strip (no modal).
  // generate_document also gets Working-strip Allow/Deny (see doc-confirm-policy).
  window.api.onToolConfirm(({ id, token, tool, args }) => {
    if (tool.name === "generate_document") {
      showDocConfirm({ token, args }, (t, approved) => {
        clearPendingConfirm(id);
        window.api.replyToolConfirm(t, approved);
      });
    }
  });

  // Generated documents surface as Open-with file rows and persist as artifacts.
  window.api.onFileGenerated(handleFileGenerated);
}

export async function sendMessage() {
  bindGovernanceNotes();
  const input = el("chat-input");
  const text = input.value.trim();
  if ((!text && !hasAttachments()) || !state.current) return;

  if (text && answerFromComposer(text)) {
    input.value = "";
    void syncWebResearchHint();
    return;
  }

  const model = getSelectedModel();
  if (!model || model === "No models found") {
    addMessage("assistant", "No model selected. Pull a model in Ollama, then pick it above.");
    return;
  }

  // Snapshot attachments for this turn, then clear the tray.
  const attachments = getAttachments();
  const thumbs = getImageThumbs();
  clearAttachments();

  input.value = "";
  void syncWebResearchHint();
  addUserMessage(text, thumbs);
  state.chat.push({ role: "user", content: text });
  updateModelLock(); // model is fixed once the conversation has started

  const key = activeKey();
  const projectId = state.mode === "project" ? state.current.id : null;
  const threadId = state.mode === "project" ? state.thread?.id : null;

  await runTurn({
    key,
    mode: state.mode,
    model,
    messages: llmMessages(state.chat),
    attachments,
    useTools: getUseTools(),
    skillOverrides:
      (state.mode === "chat" ? state.current?.skillOverrides : state.thread?.skillOverrides) || [],
    label: el("convo-name").value || "Chat",
    placeholder: el("chat-input").placeholder,
    projectId,
    threadId,
    chatId: state.mode === "chat" ? state.current.id : null,
  });

  if (state.mode === "project") await persistProjectThread();
  else if (state.mode === "chat") await persistCurrentChat();
}

export function stopActive() {
  const key = activeKey();
  if (key) stopTurn(key);
}

export function paintSendButton() {}
