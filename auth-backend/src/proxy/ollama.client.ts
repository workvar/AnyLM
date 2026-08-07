// Minimal Ollama client for the /v1 proxy.
const HOST = process.env.OLLAMA_HOST || "http://127.0.0.1:11434";

export interface ChatMessage {
  role: string;
  content: string;
}

export interface ChatResult {
  text: string;
  promptTokens: number;
  completionTokens: number;
}

export async function listModels(): Promise<string[]> {
  const res = await fetch(`${HOST}/api/tags`);
  if (!res.ok) throw new Error(`Ollama responded ${res.status}`);
  const data = (await res.json()) as { models?: { name: string }[] };
  return (data.models || []).map((m) => m.name);
}

// Streaming chat against Ollama; onToken fires per content piece.
export async function chatStream(
  model: string,
  messages: ChatMessage[],
  onToken: (piece: string) => void
): Promise<ChatResult> {
  const res = await fetch(`${HOST}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, stream: true }),
  });
  if (!res.ok || !res.body) throw new Error(`Ollama responded ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const out: ChatResult = { text: "", promptTokens: 0, completionTokens: 0 };

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const obj = JSON.parse(line);
      const piece = obj.message?.content || "";
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
