// src/renderer/js/messages.ts
export function fileArtifact({ name, ext, dir }: { name: string; ext: string; dir: string }): FileArtifactMessage {
  return { role: "artifact", type: "file", name, ext, dir, createdAt: Date.now() };
}

export function askArtifact({ question, answer }: { question: string; answer: string | null }): AskMessage {
  return { role: "ask", question, answer };
}

export function chatAttachment({
  kind,
  name,
  dataUrl,
  text,
}: {
  kind: "image" | "doc";
  name: string;
  dataUrl?: string;
  text?: string;
}): ChatAttachmentMessage {
  return {
    role: "attachment",
    kind,
    name,
    ...(dataUrl !== undefined ? { dataUrl } : {}),
    ...(text !== undefined ? { text } : {}),
    createdAt: Date.now(),
  };
}

export function isLlmMessage(m: StoredMessage): m is ChatMessage {
  return m.role === "system" || m.role === "user" || m.role === "assistant" || m.role === "tool";
}

export function llmMessages(messages: StoredMessage[] | null | undefined): ChatMessage[] {
  return (messages || []).filter(isLlmMessage).map((m) => {
    const { activity: _activity, ...rest } = m;
    return rest;
  });
}
