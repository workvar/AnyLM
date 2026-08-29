// The stored transcript of ONE conversation, addressed by the conversation it
// belongs to rather than by whatever happens to be on screen.
//
// Every write path (the user's own turn, the reply, generated artifacts) goes
// through here and appends to the record read back from disk, so switching
// chats while a turn is in flight can neither drop a message nor file it under
// the conversation the user switched to.

export type ConvoRef = {
  mode: "chat" | "project";
  chatId?: string | null;
  projectId?: string | null;
  threadId?: string | null;
};

// A turn carries the same fields; narrow it to the parts that address storage.
export function refOf(t: ConvoRef): ConvoRef {
  return t.mode === "project"
    ? { mode: "project", projectId: t.projectId, threadId: t.threadId }
    : { mode: "chat", chatId: t.chatId };
}

// The whole stored record (messages + title), or null if it is gone.
export async function readRecord(ref: ConvoRef) {
  return ref.mode === "project"
    ? await window.api.getThread(ref.projectId, ref.threadId)
    : await window.api.getChat(ref.chatId);
}

export async function readStored(ref: ConvoRef): Promise<StoredMessage[]> {
  const stored = await readRecord(ref);
  return (stored && stored.messages) || [];
}

export async function patchStored(ref: ConvoRef, patch): Promise<void> {
  if (ref.mode === "project") await window.api.updateThread(ref.projectId, ref.threadId, patch);
  else await window.api.updateChat(ref.chatId, patch);
}

// Append to the stored record and return the full message list as written.
export async function appendStored(
  ref: ConvoRef,
  messages: StoredMessage[]
): Promise<StoredMessage[]> {
  const current = await readStored(ref);
  if (!messages.length) return current;
  const next = [...current, ...messages];
  await patchStored(ref, { messages: next });
  return next;
}
