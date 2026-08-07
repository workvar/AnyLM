import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Request } from "express";
import { JwtAuthGuard } from "../auth/guards/guards";
import { ApiKeysService } from "./apikeys.service";

function uid(req: Request): string {
  return (req.user as { userId: string }).userId;
}

@UseGuards(JwtAuthGuard)
@Controller("apikeys")
export class ApiKeysController {
  constructor(private keys: ApiKeysService) {}

  @Post()
  create(@Req() req: Request, @Body() body: { name?: string }) {
    return this.keys.create(uid(req), body?.name || "");
  }

  @Get()
  list(@Req() req: Request) {
    return this.keys.list(uid(req));
  }

  @Delete(":id")
  revoke(@Req() req: Request, @Param("id") id: string) {
    return this.keys.revoke(uid(req), id);
  }
}
