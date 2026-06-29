// "Compact": summarize the current conversation and continue in a fresh thread
// (project) or chat (standalone), seeded with the summary so context stays small.
import { state } from "./state.js";
import { el } from "./dom.js";
import { getSelectedModel } from "./dropdown.js";
import { newThreadSeeded } from "./threads.js";
import { newChatSeeded } from "./chats.js";

let busy = false;

export async function compactConversation() {
  if (busy || !state.current || !state.chat.length) return;
  const model = getSelectedModel();
  if (!model || model === "No models found") return;

  busy = true;
  const btn = el("ctx-compact");
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Summarizing…";
  try {
    const summary = await window.api.summarizeChat(model, state.chat);
    const seed = [{ role: "assistant", content: `Summary of the previous conversation:\n\n${summary}` }];
    if (state.mode === "project") await newThreadSeeded(seed, "Continued");
    else await newChatSeeded(seed, "Continued");
  } catch {
    /* leave the current conversation intact on failure */
  } finally {
    btn.disabled = false;
    btn.textContent = label;
    busy = false;
  }
}
