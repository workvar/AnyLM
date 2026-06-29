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

// Streaming chat. Calls onToken(text) per chunk, returns the full string.
async function chatStream(model, messages, onToken) {
  const res = await fetch(`${HOST}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, stream: true }),
  });
  if (!res.ok) throw new Error(`Ollama responded ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let full = "";
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
      const piece = obj.message?.content || "";
      if (piece) {
        full += piece;
        onToken(piece);
      }
    }
  }
  return full;
}

module.exports = { status, listModels, info, generate, embed, chatStream, HOST };
