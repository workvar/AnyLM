// Generates a concise chat title by summarizing the conversation with the
// model, used once a conversation has its first reply and is still untitled.
import { llmMessages } from "./messages.js";

const DEFAULT_TITLES = new Set(["", "New chat", "Continued"]);

function clean(raw) {
  if (!raw) return null;
  let s = raw.split("\n").find((l) => l.trim()) || "";
  s = s.trim().replace(/^["'`*]+|["'`*.]+$/g, "").trim();
  if (s.length > 60) s = s.slice(0, 60).trim();
  return s || null;
}

// Returns a generated title, or null if not applicable / on failure.
export async function maybeTitle(model, messages, currentTitle) {
  if (!DEFAULT_TITLES.has(currentTitle || "")) return null;
  if (!model || model === "No models found") return null;
  const hasReply = (messages || []).some((m) => m.role === "assistant" && m.content);
  if (!hasReply) return null;
  try {
    return clean(await window.api.titleChat(model, llmMessages(messages)));
  } catch {
    return null;
  }
}
