import { Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { JwtAuthGuard } from "../auth/guards/guards";
import { InvitesService } from "./invites.service";

function uid(req: Request): string {
  return (req.user as { userId: string }).userId;
}

// Invitation actions from the invitee's side.
@UseGuards(JwtAuthGuard)
@Controller("invites")
export class InvitesController {
  constructor(private invites: InvitesService) {}

  @Get("mine")
  mine(@Req() req: Request) {
    return this.invites.mine(uid(req));
  }

  @Post(":id/accept")
  accept(@Req() req: Request, @Param("id") id: string) {
    return this.invites.accept(uid(req), id);
  }

  @Post(":id/decline")
  decline(@Req() req: Request, @Param("id") id: string) {
    return this.invites.decline(uid(req), id);
  }
}
