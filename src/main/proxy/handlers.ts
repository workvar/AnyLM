// The two OpenAI-compatible endpoints, ported from the backend's
// proxy.controller.ts. Governance order is unchanged: server-authoritative
// limits first, then local content evaluation, then the model call.
import * as cloud from "./cloud";
import * as ollama from "./ollama-client";
import * as engine from "../policy-engine";

function sse(res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
}

// GET /v1/models
async function models(bearer, res) {
  const [list, policies] = await Promise.all([
    ollama.listModels(),
    cloud.effectivePolicies(bearer),
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

// Governance gate shared by both response modes. Returns the (possibly
// redacted) messages plus the flags to attach to the compliance log, or
// throws with a 403 for anything blocked.
async function gate(bearer, body) {
  // Prompt size estimate (~4 chars/token) feeds token_limit policies.
  const promptEstimate = Math.round(
    body.messages.reduce((n, m) => n + (m.content ? String(m.content).length : 0), 0) / 4
  );
  const pre = await cloud.check(bearer, body.model, promptEstimate);
  if (!pre.allowed) {
    const err = new Error(pre.reason) as HttpError;
    err.status = 403;
    throw err;
  }

  const policies = await cloud.effectivePolicies(bearer);
  const messages = body.messages.map((m) => ({ ...m }));
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const flags = [...(pre.warnings || [])];

  if (lastUser) {
    const verdict = engine.evaluatePrompt(lastUser.content, policies);
    if (verdict.blocked) {
      const err = new Error(verdict.reason) as HttpError;
      err.status = 403;
      throw err;
    }
    flags.push(...verdict.warnings);
    lastUser.content = verdict.text;
  }
  return { messages, lastUser, flags };
}

// POST /v1/chat/completions
async function chatCompletions(bearer, body, res) {
  if (!body || !body.model || !Array.isArray(body.messages)) {
    const err = new Error("model and messages are required") as HttpError;
    err.status = 400;
    throw err;
  }

  const { messages, lastUser, flags } = await gate(bearer, body);
  const id = `chatcmpl-${Date.now().toString(36)}`;
  const created = Math.floor(Date.now() / 1000);

  // Metering and logging must not block the response, but they must still
  // happen for every completed call.
  const finish = (text, promptTokens, completionTokens) => {
    cloud.report(bearer, body.model, promptTokens, completionTokens).catch(() => {});
    cloud
      .log(bearer, {
        model: body.model,
        prompt: lastUser ? lastUser.content : "",
        response: text,
        flags,
      })
      .catch(() => {});
  };

  if (body.stream) {
    sse(res);
    const chunk = (delta, finishReason) =>
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
      const result = await ollama.chatStream(body.model, messages, (piece) =>
        chunk({ content: piece }, null)
      );
      chunk({}, "stop");
      res.write("data: [DONE]\n\n");
      res.end();
      finish(result.text, result.promptTokens, result.completionTokens);
    } catch (e) {
      res.write(`data: ${JSON.stringify({ error: { message: e.message } })}\n\n`);
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

