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

export async function sendMessage() {
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
      { projectId, threadId, model, messages: state.chat, attachments },
      (piece) => stream.push(piece)
    );
    stream.cancel();
    const acc = stream.text();
    setBubbleMarkdown(bubble, acc);
    el("messages").scrollTop = el("messages").scrollHeight;
    state.chat.push({ role: "assistant", content: acc });
    if (result && result.usage) setContextUsage(result.usage);
  } catch (e) {
    stream.cancel();
    bubble.classList.remove("thinking", "raw");
    bubble.textContent = `Error: ${e.message}`;
  }
  if (state.mode === "project") await persistProjectThread();
  else if (state.mode === "chat") await persistCurrentChat();
}
