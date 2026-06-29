// Chat sending and streaming.
import { el } from "./dom.js";
import { state } from "./state.js";
import { addMessage, addUserMessage, addThinking, setBubbleMarkdown } from "./views.js";
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

  // Projects inject context server-side; standalone chats have no project.
  const projectId = state.mode === "project" ? state.current.id : null;

  const bubble = addThinking();
  let acc = "";
  let started = false;
  try {
    const result = await window.api.chat(
      { projectId, model, messages: state.chat, attachments },
      (piece) => {
        acc += piece;
        if (!started) {
          started = true;
          bubble.classList.remove("thinking");
          bubble.classList.add("raw");
          bubble.textContent = "";
        }
        bubble.textContent = acc;
        el("messages").scrollTop = el("messages").scrollHeight;
      }
    );
    setBubbleMarkdown(bubble, acc);
    el("messages").scrollTop = el("messages").scrollHeight;
    state.chat.push({ role: "assistant", content: acc });
    if (result && result.usage) setContextUsage(result.usage);
  } catch (e) {
    bubble.classList.remove("thinking", "raw");
    bubble.textContent = `Error: ${e.message}`;
  }
  if (state.mode === "project") await persistProjectThread();
  else if (state.mode === "chat") await persistCurrentChat();
}
