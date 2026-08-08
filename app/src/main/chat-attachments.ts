// src/main/chat-attachments.ts
export function dataUrlToBase64(dataUrl: string): string | null {
  if (!dataUrl || typeof dataUrl !== "string") return null;
  const i = dataUrl.indexOf("base64,");
  if (i === -1) return null;
  const b64 = dataUrl.slice(i + "base64,".length).trim();
  return b64 || null;
}

export function conversationAttachments(messages: any[]): {
  docs: Array<{ name: string; text: string }>;
  images: string[];
} {
  const docs: Array<{ name: string; text: string }> = [];
  const images: string[] = [];
  for (const m of messages || []) {
    if (!m || m.role !== "attachment") continue;
    if (m.kind === "doc") {
      if (typeof m.text === "string" && m.text.length) {
        docs.push({ name: String(m.name || "document"), text: m.text });
      }
    } else if (m.kind === "image") {
      const b64 = dataUrlToBase64(String(m.dataUrl || ""));
      if (b64) images.push(b64);
    }
  }
  return { docs, images };
}
