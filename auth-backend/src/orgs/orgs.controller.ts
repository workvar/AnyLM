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
import { Request, Response } from "express";
import { Res, Query } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/guards";
import { OrgsService } from "./orgs.service";
import { PoliciesService } from "../policies/policies.service";
import { UsageService } from "../usage/usage.service";
import { InvitesService } from "../invites/invites.service";
import { TeamsService } from "../teams/teams.service";
import { LogsService } from "../logs/logs.service";

function uid(req: Request): string {
  return (req.user as { userId: string }).userId;
}

@UseGuards(JwtAuthGuard)
@Controller("orgs")
export class OrgsController {
  constructor(
    private orgs: OrgsService,
    private policies: PoliciesService,
    private usage: UsageService,
    private invites: InvitesService,
    private teams: TeamsService,
    private logs: LogsService
  ) {}

  @Post()
  create(@Req() req: Request, @Body() body: { name: string }) {
    return this.orgs.create(uid(req), body.name);
  }

  @Get("mine")
  mine(@Req() req: Request) {
    return this.orgs.mine(uid(req));
  }

  @Get(":id")
  get(@Req() req: Request, @Param("id") id: string) {
    return this.orgs.get(id, uid(req));
  }

  @Patch(":id")
  update(@Req() req: Request, @Param("id") id: string, @Body() body: Record<string, unknown>) {
    return this.orgs.update(id, uid(req), body);
  }

  @Delete(":id")
  remove(@Req() req: Request, @Param("id") id: string) {
    return this.orgs.remove(id, uid(req));
  }

  @Post(":id/members")
  addMember(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() body: { email: string; role?: string }
  ) {
    return this.orgs.addMember(id, uid(req), body.email, body.role || "member");
  }

  @Patch(":id/members/:memberId")
  updateMember(
    @Req() req: Request,
    @Param("id") id: string,
    @Param("memberId") memberId: string,
    @Body() body: Record<string, unknown>
  ) {
    return this.orgs.updateMember(id, uid(req), memberId, body);
  }

  @Delete(":id/members/:memberId")
  removeMember(
    @Req() req: Request,
    @Param("id") id: string,
    @Param("memberId") memberId: string
  ) {
    return this.orgs.removeMember(id, uid(req), memberId);
  }

  @Get(":id/policies")
  orgPolicies(@Req() req: Request, @Param("id") id: string) {
    return this.policies.forOrg(id, uid(req));
  }

  @Get(":id/usage")
  orgUsage(@Req() req: Request, @Param("id") id: string) {
    return this.usage.orgSummary(id, uid(req));
  }

  @Get(":id/audit")
  audit(@Req() req: Request, @Param("id") id: string) {
    return this.orgs.auditLog(id, uid(req));
  }

  // --- Invitations (pending-state member onboarding) ---

  @Post(":id/invites")
  invite(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() body: { email: string; role?: string }
  ) {
    return this.invites.create(id, uid(req), body.email, body.role || "member");
  }

  @Get(":id/invites")
  listInvites(@Req() req: Request, @Param("id") id: string) {
    return this.invites.listForOrg(id, uid(req));
  }

  @Delete(":id/invites/:inviteId")
  revokeInvite(
    @Req() req: Request,
    @Param("id") id: string,
    @Param("inviteId") inviteId: string
  ) {
    return this.invites.revoke(id, uid(req), inviteId);
  }

  // --- Teams (departments with rolled-up budgets) ---

  @Post(":id/teams")
  createTeam(@Req() req: Request, @Param("id") id: string, @Body() body: { name: string }) {
    return this.teams.create(id, uid(req), body.name);
  }

  @Get(":id/teams")
  listTeams(@Req() req: Request, @Param("id") id: string) {
    return this.teams.listWithUsage(id, uid(req));
  }

  @Patch(":id/teams/:teamId")
  updateTeam(
    @Req() req: Request,
    @Param("id") id: string,
    @Param("teamId") teamId: string,
    @Body() body: Record<string, unknown>
  ) {
    return this.teams.update(id, uid(req), teamId, body);
  }

  @Delete(":id/teams/:teamId")
  removeTeam(
    @Req() req: Request,
    @Param("id") id: string,
    @Param("teamId") teamId: string
  ) {
    return this.teams.remove(id, uid(req), teamId);
  }

  // --- Compliance logs ---

  @Get(":id/logs")
  listLogs(
    @Req() req: Request,
    @Param("id") id: string,
    @Query("q") q?: string
  ) {
    return this.logs.list(id, uid(req), q);
  }

  @Delete(":id/logs")
  clearLogs(@Req() req: Request, @Param("id") id: string) {
    return this.logs.clear(id, uid(req));
  }

  // --- Usage export (CSV) ---

  @Get(":id/usage/export")
  async exportUsage(@Req() req: Request, @Param("id") id: string, @Res() res: Response) {
    const csv = await this.usage.exportCsv(id, uid(req));
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="anylm-usage-${id}.csv"`);
    res.send(csv);
  }
}
