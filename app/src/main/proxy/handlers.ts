// The two OpenAI-compatible endpoints.
//
// Governance order is unchanged from when this ran on the server: limits and
// allowlists first, then content evaluation, then the model call. What
// changed is that the key is resolved to a user once, up front, and the
// resulting userId is what everything downstream works with.
import * as http from "http";
import * as cloud from "./cloud";
import * as ollama from "./ollama-client";
import * as engine from "../policy-engine";

interface ChatMessage {
  role: string;
  content: string;
}

interface ChatBody {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
}

function httpError(message: string, status: number): Error & { status: number } {
  const err = new Error(message) as Error & { status: number };
  err.status = status;
  return err;
}

/** GET /v1/models */
async function models(userId: string, res: http.ServerResponse): Promise<void> {
  const [list, policies] = await Promise.all([
    ollama.listModels(),
    cloud.effectivePolicies(userId),
  ]);
  const allowed = engine.filterModels(list, policies);
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({
      object: "list",
      data: allowed.map((id) => ({ id, object: "model", owned_by: "anylm" })),
    })
  );
}

/**
 * Shared governance gate. Returns the possibly-redacted messages plus the
 * flags to attach to the compliance log, or throws 403 for anything blocked.
 */
async function gate(userId: string, body: ChatBody) {
  // Prompt size estimate (~4 chars/token) feeds token_limit policies.
  const promptEstimate = Math.round(
    body.messages.reduce((n, m) => n + (m.content ? String(m.content).length : 0), 0) / 4
  );
  const pre = await cloud.preflight(userId, body.model, promptEstimate);
  if (!pre.allowed) throw httpError(pre.reason || "Blocked by policy", 403);

  const policies = await cloud.effectivePolicies(userId);
  const messages = body.messages.map((m) => ({ ...m }));
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const flags = [...(pre.warnings || [])];

  if (lastUser) {
    const verdict = engine.evaluatePrompt(lastUser.content, policies);
    if (verdict.blocked) throw httpError(verdict.reason, 403);
    flags.push(...verdict.warnings);
    lastUser.content = verdict.text;
  }
  return { messages, lastUser, flags };
}

/** POST /v1/chat/completions */
async function chatCompletions(
  userId: string,
  body: ChatBody,
  res: http.ServerResponse
): Promise<void> {
  if (!body || !body.model || !Array.isArray(body.messages)) {
    throw httpError("model and messages are required", 400);
  }

  const { messages, lastUser, flags } = await gate(userId, body);
  const id = `chatcmpl-${Date.now().toString(36)}`;
  const created = Math.floor(Date.now() / 1000);

  // Metering and logging must not block the response, but they must still
  // happen for every completed call.
  const finish = (text: string, promptTokens: number, completionTokens: number) => {
    cloud.report(userId, body.model, promptTokens, completionTokens).catch(() => {});
    cloud
      .log(userId, {
        model: body.model,
        prompt: lastUser ? lastUser.content : "",
        response: text,
        flags,
      })
      .catch(() => {});
  };

  if (body.stream) {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    const chunk = (delta: object, finishReason: string | null) =>
      res.write(
        `data: ${JSON.stringify({
          id,
          object: "chat.completion.chunk",
          created,
          model: body.model,
          choices: [{ index: 0, delta, finish_reason: finishReason }],
        })}\n\n`
      );
    try {
      chunk({ role: "assistant" }, null);
      const result = await ollama.chatStream(body.model, messages, (piece) => {
        if (piece.content) chunk({ content: piece.content }, null);
      });
      chunk({}, "stop");
      res.write("data: [DONE]\n\n");
      res.end();
      finish(result.text, result.promptTokens, result.completionTokens);
    } catch (e) {
      res.write(`data: ${JSON.stringify({ error: { message: (e as Error).message } })}\n\n`);
      res.end();
    }
    return;
  }

  const result = await ollama.chatStream(body.model, messages, () => {});
  finish(result.text, result.promptTokens, result.completionTokens);
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({
      id,
      object: "chat.completion",
      created,
      model: body.model,
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: result.text },
          finish_reason: "stop",
        },
      ],
      usage: {
        prompt_tokens: result.promptTokens,
        completion_tokens: result.completionTokens,
        total_tokens: result.promptTokens + result.completionTokens,
      },
    })
  );
}

export { models, chatCompletions };
