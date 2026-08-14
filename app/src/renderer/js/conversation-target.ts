// Which conversation an async action started in. Captured before any `await`
// so a patch always lands on the chat/thread the user actually acted in, even
// if they navigate away mid-flight.
import { state } from "./state.js";

export type ConversationTarget =
  | { mode: "chat"; chatId: string }
  | { mode: "project"; projectId: string; threadId: string };

export function captureConversationTarget(): ConversationTarget | null {
  if (state.mode === "chat" && state.current) {
    return { mode: "chat", chatId: state.current.id };
  }
  if (state.mode === "project" && state.current && state.thread) {
    return { mode: "project", projectId: state.current.id, threadId: state.thread.id };
  }
  return null;
}

export function isCurrentTarget(target: ConversationTarget): boolean {
  if (target.mode === "chat") {
    return state.mode === "chat" && state.current?.id === target.chatId;
  }
  return (
    state.mode === "project" &&
    state.current?.id === target.projectId &&
    state.thread?.id === target.threadId
  );
}

export function targetOverrides(target: ConversationTarget): string[] {
  if (!isCurrentTarget(target)) return [];
  const source = target.mode === "chat" ? state.current : state.thread;
  return [...(source?.skillOverrides || [])];
}

// The one write path for per-conversation settings (useTools, skillOverrides…).
export async function persistConversationPatch(
  target: ConversationTarget,
  patch: Record<string, unknown>
): Promise<void> {
  if (target.mode === "chat") {
    if (isCurrentTarget(target)) state.current = { ...state.current, ...patch };
    await window.api.updateChat(target.chatId, patch);
    return;
  }
  if (isCurrentTarget(target)) state.thread = { ...state.thread, ...patch };
  await window.api.updateThread(target.projectId, target.threadId, patch);
}
