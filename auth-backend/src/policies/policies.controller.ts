import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Request } from "express";
import { JwtAuthGuard } from "../auth/guards/guards";
import { PoliciesService, PolicyInput } from "./policies.service";
import { UsageService } from "../usage/usage.service";

function uid(req: Request): string {
  return (req.user as { userId: string }).userId;
}

@UseGuards(JwtAuthGuard)
@Controller("policies")
export class PoliciesController {
  constructor(private policies: PoliciesService, private usage: UsageService) {}

  // Everything the app needs to govern a session in one call.
  @Get("effective")
  async effective(@Req() req: Request) {
    const userId = uid(req);
    const [policies, limits] = await Promise.all([
      this.policies.effective(userId),
      this.usage.limitsFor(userId),
    ]);
    return { policies, limits };
  }

  @Get("mine")
  mine(@Req() req: Request) {
    return this.policies.personal(uid(req));
  }

  @Post()
  create(@Req() req: Request, @Body() body: PolicyInput) {
    return this.policies.create(uid(req), body);
  }

  @Patch(":id")
  update(@Req() req: Request, @Param("id") id: string, @Body() body: Record<string, unknown>) {
    return this.policies.update(uid(req), id, body);
  }

  @Delete(":id")
  remove(@Req() req: Request, @Param("id") id: string) {
    return this.policies.remove(uid(req), id);
  }
}
