// Chat sending and streaming.
import { el } from "./dom.js";
import { state } from "./state.js";
import { addMessage, clearMessages } from "./views.js";

export function resetChat() {
  state.chat = [];
  clearMessages();
}

export async function sendMessage() {
  const input = el("chat-input");
  const text = input.value.trim();
  if (!text || !state.current) return;

  const model = el("model-select").value;
  if (!model || model === "No models found") {
    addMessage("assistant", "No model selected. Pull a model in Ollama, then pick it above.");
    return;
  }

  input.value = "";
  addMessage("user", text);
  state.chat.push({ role: "user", content: text });

  const bubble = addMessage("assistant", "");
  let acc = "";
  try {
    await window.api.chat(
      { projectId: state.current.id, model, messages: state.chat },
      (piece) => {
        acc += piece;
        bubble.textContent = acc;
        el("messages").scrollTop = el("messages").scrollHeight;
      }
    );
    state.chat.push({ role: "assistant", content: acc });
  } catch (e) {
    bubble.textContent = `Error: ${e.message}`;
  }
}
