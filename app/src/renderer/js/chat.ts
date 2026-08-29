// Chat sending and streaming.
import { resizeComposer } from "./composer-autogrow.js";
import { el } from "./dom.js";
import { state } from "./state.js";
import { addMessage, addUserMessage } from "./views.js";
import { updateModelLock } from "./convo.js";
import { getSelectedModel } from "./dropdown.js";
import { loadRecents } from "./recents.js";
import { appendStored, refOf } from "./convo-store.js";
import { snapshotPending, hasAttachments, clearAttachments } from "./attach.js";
import { showDocConfirm } from "./file-cards.js";
import { chatAttachment } from "./messages.js";
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
    resizeComposer(input);
    void syncWebResearchHint();
    return;
  }

  const model = getSelectedModel();
  if (!model || model === "No models found") {
    addMessage("assistant", "No model selected. Pull a model in Ollama, then pick it above.");
    return;
  }

  // Snapshot attachments for this turn, then clear the tray.
  const pending = snapshotPending();
  clearAttachments();

  input.value = "";
    resizeComposer(input);
  void syncWebResearchHint();

  const outgoing: StoredMessage[] = pending.map((p) =>
    chatAttachment({
      kind: p.kind,
      name: p.name,
      text: p.kind === "doc" ? p.text : undefined,
      dataUrl: p.kind === "image" ? p.dataUrl : undefined,
    })
  );
  outgoing.push({ role: "user", content: text });
  // Interim: thumbs-only until Task 5 groups attachment cards with the user bubble.
  addUserMessage(
    text,
    pending
      .filter((p) => p.kind === "image")
      .map((p) => p.dataUrl)
      .filter(Boolean)
  );
  state.chat.push(...outgoing);
  updateModelLock(); // model is fixed once the conversation has started

  const key = activeKey();
  const projectId = state.mode === "project" ? state.current.id : null;
  const threadId = state.mode === "project" ? state.thread?.id : null;
  const chatId = state.mode === "chat" ? state.current.id : null;
  const ref = refOf({ mode: state.mode, projectId, threadId, chatId });

  // Store the outgoing messages BEFORE the turn starts. The reply is written by
  // the turn itself (turns.ts commit) against this same conversation, so the
  // user can switch chats mid-turn without their own message being lost.
  await appendStored(ref, outgoing);

  await runTurn({
    key,
    mode: state.mode,
    model,
    messages: state.chat,
    useTools: getUseTools(),
    skillOverrides:
      (state.mode === "chat" ? state.current?.skillOverrides : state.thread?.skillOverrides) || [],
    label: el("convo-name").value || "Chat",
    placeholder: el("chat-input").placeholder,
    projectId,
    threadId,
    chatId,
  });

  // The reply, its title and any artifacts are already persisted by the turn.
  // All that is left is repainting the sidebar for whatever is on screen now.
  await loadRecents();
}

export function stopActive() {
  const key = activeKey();
  if (key) stopTurn(key);
}

export function paintSendButton() {}
