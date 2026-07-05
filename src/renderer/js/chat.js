// Chat sending and streaming.
import { el } from "./dom.js";
import { state } from "./state.js";
import { addMessage, addUserMessage, addThinking, setBubbleMarkdown } from "./views.js";
import { createStreamRenderer } from "./stream.js";
import { updateModelLock } from "./convo.js";
import { getSelectedModel } from "./dropdown.js";
import { persistCurrentChat } from "./chats.js";
import { persistProjectThread } from "./threads.js";
import { setContextUsage } from "./contextmeter.js";
import { getAttachments, getImageThumbs, hasAttachments, clearAttachments } from "./attach.js";
import { attachExportActions } from "./exports.js";
import { attachTokenStats } from "./tokenstats.js";

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

let useTools = false;
let toolsBound = false;

export function initToolUse() {
  if (toolsBound) return;
  toolsBound = true;

  const toggle = el("tools-toggle");
  toggle.onclick = () => {
    useTools = !useTools;
    toggle.classList.toggle("active", useTools);
    toggle.title = useTools ? "Tools enabled for this chat" : "Let the model use tools";
  };

  // Tool activity → inline note in the conversation.
  window.api.onToolEvent(({ name, args, status, output }) => {
    const wrap = el("messages");
    if (status === "running") {
      const note = document.createElement("div");
      note.className = "gov-note tool-note";
      note.dataset.tool = name;
      note.textContent = `⚒ Running ${name}(${summarizeArgs(args)})…`;
      wrap.appendChild(note);
    } else {
      const running = [...wrap.querySelectorAll(`.tool-note[data-tool="${name}"]`)].pop();
      const text = `⚒ ${name}(${summarizeArgs(args)}) → ${String(output || "").split("\n")[0].slice(0, 120)}`;
      if (running) running.textContent = text;
    }
    wrap.scrollTop = wrap.scrollHeight;
  });

  // Risky tool confirmation dialog.
  window.api.onToolConfirm(({ token, tool, args }) => {
    el("tc-name").textContent = tool.name;
    el("tc-args").textContent = JSON.stringify(args, null, 2);
    el("tool-confirm-modal").classList.remove("hidden");
    const done = (approved) => {
      el("tool-confirm-modal").classList.add("hidden");
      window.api.replyToolConfirm(token, approved);
    };
    el("tc-allow").onclick = () => done(true);
    el("tc-deny").onclick = () => done(false);
  });
}

function summarizeArgs(args) {
  try {
    return Object.entries(args || {})
      .map(([k, v]) => `${k}: ${String(v).slice(0, 40)}`)
      .join(", ");
  } catch {
    return "";
  }
}

export async function sendMessage() {
  bindGovernanceNotes();
  const input = el("chat-input");
  const text = input.value.trim();
  if ((!text && !hasAttachments()) || !state.current) return;

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
  addUserMessage(text, thumbs);
  state.chat.push({ role: "user", content: text });
  updateModelLock(); // model is fixed once the conversation has started

  // Projects inject context server-side; standalone chats have no project.
  const projectId = state.mode === "project" ? state.current.id : null;
  const threadId = state.mode === "project" ? state.thread?.id : null;

  const bubble = addThinking();
  const stream = createStreamRenderer(bubble);
  try {
    const result = await window.api.chat(
      { projectId, threadId, model, messages: state.chat, attachments, useTools },
      (piece) => stream.push(piece)
    );
    stream.cancel();
    const acc = stream.text();
    setBubbleMarkdown(bubble, acc);
    attachExportActions(bubble, acc); // Save MD / Save PDF into the project folder
    el("messages").scrollTop = el("messages").scrollHeight;
    state.chat.push({ role: "assistant", content: acc });
    if (result && result.usage) {
      setContextUsage(result.usage);
      attachTokenStats(bubble, result.usage);
    }
  } catch (e) {
    stream.cancel();
    bubble.classList.remove("thinking", "raw");
    bubble.textContent = `Error: ${e.message}`;
  }
  if (state.mode === "project") await persistProjectThread();
  else if (state.mode === "chat") await persistCurrentChat();
}
