// Thin client for a local Ollama server (default http://127.0.0.1:11434).
import { env } from "./env";

// OLLAMA_HOST is Ollama's own convention, so it still wins if the user has it
// set machine-wide; otherwise the build value from app/.env applies.
const HOST = process.env.OLLAMA_HOST || env.ollamaHost;

async function status(): Promise<{ ok: boolean; host: string; error?: string }> {
  try {
    const res = await fetch(`${HOST}/api/tags`);
    return { ok: res.ok, host: HOST };
  } catch (e) {
    return { ok: false, host: HOST, error: (e as Error).message };
  }
}

async function listModels(): Promise<string[]> {
  const entries = await listModelEntries();
  return entries.map((m) => m.name);
}

/** Installed models with on-disk size from Ollama `/api/tags`. */
async function listModelEntries(): Promise<{ name: string; size: number }[]> {
  const res = await fetch(`${HOST}/api/tags`);
  if (!res.ok) throw new Error(`Ollama responded ${res.status}`);
  const data = ((await res.json()) as any);
  return (data.models || []).map((m: { name: string; size?: number }) => ({
    name: m.name,
    size: m.size || 0,
  }));
}

// Model details. Returns { contextLength } parsed from /api/show model_info.
async function info(model: string): Promise<{ contextLength: number | null }> {
  try {
    const res = await fetch(`${HOST}/api/show`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model }),
    });
    if (!res.ok) return { contextLength: null };
    const data = ((await res.json()) as any);
    const mi = data.model_info || {};
    const key = Object.keys(mi).find((k) => k.endsWith(".context_length"));
    return { contextLength: key ? mi[key] : null };
  } catch {
    return { contextLength: null };
  }
}

// Non-streaming generate, used for context summarization.
async function generate(model: string, prompt: string): Promise<string> {
  const res = await fetch(`${HOST}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, prompt, stream: false }),
  });
  if (!res.ok) throw new Error(`Ollama responded ${res.status}`);
  const data = ((await res.json()) as any);
  return data.response || "";
}

// Same as `generate`, but also surfaces token usage (Ollama returns
// prompt_eval_count / eval_count on the /api/generate response, same fields
// `chatStream`'s final frame carries). Used by the multi-agent gate
// (classify/plan) so their cost is metered; `generate` stays string-only
// since its other callers (context summaries, etc.) don't track usage.
async function generateWithUsage(
  model: string,
  prompt: string
): Promise<{ text: string; promptTokens: number; completionTokens: number }> {
  const res = await fetch(`${HOST}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, prompt, stream: false }),
  });
  if (!res.ok) throw new Error(`Ollama responded ${res.status}`);
  const data = ((await res.json()) as any);
  return {
    text: data.response || "",
    promptTokens: data.prompt_eval_count || 0,
    completionTokens: data.eval_count || 0,
  };
}

// Embed one or many strings. Returns an array of vectors (number[][]).
async function embed(model: string, input: string | string[]): Promise<number[][]> {
  const res = await fetch(`${HOST}/api/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, input }),
  });
  if (!res.ok) throw new Error(`Ollama embed responded ${res.status}`);
  const data = ((await res.json()) as any);
  return data.embeddings || [];
}

// Pull (download) a model. Calls onProgress({ percent, status }) as it streams.
async function pull(model: string, onProgress: (p: PullProgress) => void = () => {}): Promise<void> {
  const res = await fetch(`${HOST}/api/pull`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, stream: true }),
  });
  if (!res.ok) throw new Error(`Ollama pull responded ${res.status}`);

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop()!;
    for (const line of lines) {
      if (!line.trim()) continue;
      const obj = JSON.parse(line);
      if (obj.error) throw new Error(obj.error);
      const percent =
        obj.total && obj.completed != null
          ? Math.round((obj.completed / obj.total) * 100)
          : null;
      onProgress({ percent, status: obj.status || "" });
    }
  }
}

// Streaming chat. Calls onToken(text) per chunk. Returns
// { text, promptTokens, completionTokens, toolCalls } — counts come from
// Ollama's final stream frame (prompt_eval_count / eval_count) for exact usage
// metering. Pass `tools` (Ollama function schemas) to enable tool calling;
// any tool_calls the model emits are collected into `toolCalls`.
async function chatStream(
  model: string,
  messages: ChatMessage[],
  onToken: (piece: string) => void,
  tools?: OllamaToolDef[] | null,
  numCtx?: number | null,
  signal?: AbortSignal
): Promise<ChatStreamResult> {
  const res = await fetch(`${HOST}/api/chat`, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      ...(tools && tools.length ? { tools } : {}),
      // Ollama defaults to a small window regardless of what the model
      // supports, which silently drops the start of a long conversation.
      ...(numCtx ? { options: { num_ctx: numCtx } } : {}),
    }),
  });
  if (!res.ok) throw new Error(`Ollama responded ${res.status}`);

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let full = "";
  let buffer = "";
  let promptTokens = 0;
  let completionTokens = 0;
  const toolCalls: OllamaToolCall[] = [];

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop()!;
    for (const line of lines) {
      if (!line.trim()) continue;
      const obj = JSON.parse(line);
      const piece = obj.message?.content || "";
      if (piece) {
        full += piece;
        onToken(piece);
      }
      if (Array.isArray(obj.message?.tool_calls)) {
        toolCalls.push(...obj.message.tool_calls);
      }
      if (obj.done) {
        promptTokens = obj.prompt_eval_count || 0;
        completionTokens = obj.eval_count || 0;
      }
    }
  }
  return { text: full, promptTokens, completionTokens, toolCalls };
}


// Delete a model. Returns a promise that resolves when deletion is complete.
async function deleteModel(model: string): Promise<boolean> {
  const res = await fetch(`${HOST}/api/delete`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model }),
  });
  if (!res.ok) throw new Error(`Ollama delete responded ${res.status}`);
  return true;
}

export {
  status,
  listModels,
  listModelEntries,
  info,
  generate,
  generateWithUsage,
  embed,
  chatStream,
  pull,
  deleteModel,
  HOST,
};

