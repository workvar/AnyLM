// Thin client for a local Ollama server (default http://127.0.0.1:11434).
const HOST = process.env.OLLAMA_HOST || "http://127.0.0.1:11434";

async function status() {
  try {
    const res = await fetch(`${HOST}/api/tags`);
    return { ok: res.ok, host: HOST };
  } catch (e) {
    return { ok: false, host: HOST, error: e.message };
  }
}

async function listModels() {
  const res = await fetch(`${HOST}/api/tags`);
  if (!res.ok) throw new Error(`Ollama responded ${res.status}`);
  const data = await res.json();
  return (data.models || []).map((m) => m.name);
}

// Model details. Returns { contextLength } parsed from /api/show model_info.
async function info(model) {
  try {
    const res = await fetch(`${HOST}/api/show`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model }),
    });
    if (!res.ok) return { contextLength: null };
    const data = await res.json();
    const mi = data.model_info || {};
    const key = Object.keys(mi).find((k) => k.endsWith(".context_length"));
    return { contextLength: key ? mi[key] : null };
  } catch {
    return { contextLength: null };
  }
}

// Non-streaming generate, used for context summarization.
async function generate(model, prompt) {
  const res = await fetch(`${HOST}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, prompt, stream: false }),
  });
  if (!res.ok) throw new Error(`Ollama responded ${res.status}`);
  const data = await res.json();
  return data.response || "";
}

// Embed one or many strings. Returns an array of vectors (number[][]).
async function embed(model, input) {
  const res = await fetch(`${HOST}/api/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, input }),
  });
  if (!res.ok) throw new Error(`Ollama embed responded ${res.status}`);
  const data = await res.json();
  return data.embeddings || [];
}

// Pull (download) a model. Calls onProgress({ percent, status }) as it streams.
async function pull(model, onProgress = () => {}) {
  const res = await fetch(`${HOST}/api/pull`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, stream: true }),
  });
  if (!res.ok) throw new Error(`Ollama pull responded ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop();
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
async function chatStream(model, messages, onToken, tools) {
  const res = await fetch(`${HOST}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      ...(tools && tools.length ? { tools } : {}),
    }),
  });
  if (!res.ok) throw new Error(`Ollama responded ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let full = "";
  let buffer = "";
  let promptTokens = 0;
  let completionTokens = 0;
  const toolCalls = [];

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop();
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
async function deleteModel(model) {
  const res = await fetch(`${HOST}/api/delete`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model }),
  });
  if (!res.ok) throw new Error(`Ollama delete responded ${res.status}`);
  return true;
}

module.exports = { status, listModels, info, generate, embed, chatStream, pull, deleteModel, HOST };
