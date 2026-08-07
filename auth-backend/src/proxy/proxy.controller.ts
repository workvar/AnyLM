// OpenAI-compatible endpoint so other local apps can route LLM calls through
// AnyLM under the same governance: API-key auth, policy checks, token
// metering, and compliance logging.
import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Post,
  Res,
} from "@nestjs/common";
import { Response } from "express";
import { ApiKeysService } from "../apikeys/apikeys.service";
import { PoliciesService } from "../policies/policies.service";
import { UsageService } from "../usage/usage.service";
import { LogsService } from "../logs/logs.service";
import { evaluatePrompt } from "../governance/evaluator";
import { chatStream, listModels, ChatMessage } from "./ollama.client";

interface ChatBody {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
}

@Controller("v1")
export class ProxyController {
  constructor(
    private keys: ApiKeysService,
    private policies: PoliciesService,
    private usage: UsageService,
    private logs: LogsService
  ) {}

  @Get("models")
  async models(@Headers("authorization") authz: string) {
    const userId = await this.keys.authenticate(authz);
    let models = await listModels();
    const pols = await this.policies.effective(userId);
    for (const p of pols) {
      if (p.type !== "model_allowlist" || p.action === "warn") continue;
      const cfg = safeParse(p.config);
      const allowed: string[] = Array.isArray(cfg.models) ? (cfg.models as string[]) : [];
      if (allowed.length) models = models.filter((m) => allowed.includes(m));
    }
    return {
      object: "list",
      data: models.map((id) => ({ id, object: "model", owned_by: "anylm" })),
    };
  }

  @Post("chat/completions")
  async chat(
    @Headers("authorization") authz: string,
    @Body() body: ChatBody,
    @Res() res: Response
  ) {
    const userId = await this.keys.authenticate(authz);
    if (!body || !body.model || !Array.isArray(body.messages))
      throw new BadRequestException("model and messages are required");

    // Governance: limits/budget/rate/allowlist, then content policies.
    // Prompt size estimate (~4 chars/token) feeds token_limit policies.
    const promptEstimate = Math.round(
      body.messages.reduce((n, m) => n + (m.content ? String(m.content).length : 0), 0) / 4
    );
    const pre = await this.usage.check(userId, body.model, promptEstimate);
    if (!pre.allowed) throw new ForbiddenException(pre.reason);
    const pols = await this.policies.effective(userId);
    const messages = body.messages.map((m) => ({ ...m }));
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    const flags: string[] = [...(pre.warnings || [])];
    if (lastUser) {
      const verdict = evaluatePrompt(lastUser.content, pols);
      if (verdict.blocked) throw new ForbiddenException(verdict.reason);
      flags.push(...verdict.warnings);
      lastUser.content = verdict.text;
    }

    const id = `chatcmpl-${Date.now().toString(36)}`;
    const created = Math.floor(Date.now() / 1000);

    const finish = (text: string, promptTokens: number, completionTokens: number) => {
      this.usage.report(userId, { model: body.model, promptTokens, completionTokens }).catch(() => {});
      this.logs
        .record(userId, {
          model: body.model,
          prompt: lastUser ? lastUser.content : "",
          response: text,
          flags,
        })
        .catch(() => {});
    };

    if (body.stream) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
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
        const result = await chatStream(body.model, messages, (piece) =>
          chunk({ content: piece }, null)
        );
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

    const result = await chatStream(body.model, messages, () => {});
    finish(result.text, result.promptTokens, result.completionTokens);
    res.json({
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
    });
  }
}

function safeParse(json: string): Record<string, unknown> {
  try {
    return JSON.parse(json) || {};
  } catch {
    return {};
  }
}
