// Minimal Ollama client for the local /v1 proxy.
//
// Ported from the backend's ollama.client.ts. It belongs here now: Ollama
// listens on the user's own loopback interface, which a Cloud Function can
// never reach.
import { env } from "../env";

const HOST = process.env.OLLAMA_HOST || env.ollamaHost;

async function listModels() {
  const res = await fetch(`${HOST}/api/tags`);
  if (!res.ok) throw new Error(`Ollama responded ${res.status}`);
  const data = ((await res.json()) as any);
  return (data.models || []).map((m) => m.name);
}

// Streaming chat against Ollama; onToken fires per content piece.
// Resolves with the full text plus Ollama's real token counts.
async function chatStream(model, messages, onToken) {
  const res = await fetch(`${HOST}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, stream: true }),
  });
  if (!res.ok || !res.body) throw new Error(`Ollama responded ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const out = { text: "", promptTokens: 0, completionTokens: 0 };

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (!line.trim()) continue;
      let obj;
      try {
        obj = JSON.parse(line);
      } catch {
        continue;
      }
      const piece = (obj.message && obj.message.content) || "";
      if (piece) {
        out.text += piece;
        onToken(piece);
      }
      if (obj.done) {
        out.promptTokens = obj.prompt_eval_count || 0;
        out.completionTokens = obj.eval_count || 0;
      }
    }
  }
  return out;
}

export { listModels, chatStream, HOST };

