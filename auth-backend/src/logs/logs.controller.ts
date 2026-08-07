import { Body, Controller, Post, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { JwtAuthGuard } from "../auth/guards/guards";
import { LogsService } from "./logs.service";

// The desktop app reports each interaction here; it is stored only for orgs
// that have compliance logging enabled.
@UseGuards(JwtAuthGuard)
@Controller("logs")
export class LogsController {
  constructor(private logs: LogsService) {}

  @Post()
  record(
    @Req() req: Request,
    @Body() body: { model: string; prompt: string; response: string; flags?: string[] }
  ) {
    const u = req.user as { userId: string };
    return this.logs.record(u.userId, body);
  }
}
