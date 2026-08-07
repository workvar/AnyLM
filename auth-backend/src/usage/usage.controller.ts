import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { JwtAuthGuard } from "../auth/guards/guards";
import { UsageService } from "./usage.service";

function uid(req: Request): string {
  return (req.user as { userId: string }).userId;
}

@UseGuards(JwtAuthGuard)
@Controller("usage")
export class UsageController {
  constructor(private usage: UsageService) {}

  // Pre-flight: limits, budget, rate, and model-allowlist enforcement.
  @Post("check")
  check(@Req() req: Request, @Body() body: { model: string; promptTokens?: number }) {
    return this.usage.check(uid(req), body.model || "", Math.max(0, Math.round(body.promptTokens || 0)));
  }

  // Called after each completed LLM request with real token counts.
  @Post("report")
  report(
    @Req() req: Request,
    @Body() body: { model: string; promptTokens?: number; completionTokens?: number }
  ) {
    return this.usage.report(uid(req), body);
  }

  @Get("me")
  me(@Req() req: Request) {
    return this.usage.limitsFor(uid(req));
  }
}
