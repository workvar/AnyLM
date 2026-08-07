import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { OrgsService } from "../orgs/orgs.service";
import { periodStart } from "../governance/periods";

export interface TeamUsageRow {
  id: string;
  name: string;
  tokenLimit: number | null;
  budgetLimit: number | null;
  limitPeriod: string;
  memberCount: number;
  members: { memberId: string; email: string; name: string | null }[];
  usedTokens: number;
  usedCost: number;
}

@Injectable()
export class TeamsService {
  constructor(private prisma: PrismaService, private orgs: OrgsService) {}

  async create(orgId: string, actorId: string, name: string) {
    await this.orgs.requireRole(orgId, actorId, "admin");
    const team = await this.prisma.team.create({ data: { orgId, name } });
    await this.orgs.audit(orgId, actorId, "team.create", name);
    return team;
  }

  async update(
    orgId: string,
    actorId: string,
    teamId: string,
    patch: { name?: string; tokenLimit?: number | null; budgetLimit?: number | null; limitPeriod?: string }
  ) {
    await this.orgs.requireRole(orgId, actorId, "admin");
    const team = await this.prisma.team.findUnique({ where: { id: teamId } });
    if (!team || team.orgId !== orgId) throw new NotFoundException("Team not found");
    const updated = await this.prisma.team.update({
      where: { id: teamId },
      data: {
        name: patch.name,
        tokenLimit: patch.tokenLimit,
        budgetLimit: patch.budgetLimit,
        limitPeriod: patch.limitPeriod,
      },
    });
    await this.orgs.audit(orgId, actorId, "team.update", JSON.stringify({ teamId, ...patch }));
    return updated;
  }

  async remove(orgId: string, actorId: string, teamId: string) {
    await this.orgs.requireRole(orgId, actorId, "admin");
    const team = await this.prisma.team.findUnique({ where: { id: teamId } });
    if (!team || team.orgId !== orgId) throw new NotFoundException("Team not found");
    await this.prisma.team.delete({ where: { id: teamId } });
    await this.orgs.audit(orgId, actorId, "team.delete", team.name);
    return { success: true };
  }

  // Tokens consumed by a team's current members within the team's period.
  async teamUsage(teamId: string) {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      include: { members: true },
    });
    if (!team) return { team: null, usedTokens: 0 };
    const userIds = team.members.map((m) => m.userId);
    if (!userIds.length) return { team, usedTokens: 0 };
    const start = periodStart(team.limitPeriod);
    const agg = await this.prisma.usageRecord.aggregate({
      where: {
        orgId: team.orgId,
        userId: { in: userIds },
        ...(start ? { createdAt: { gte: start } } : {}),
      },
      _sum: { totalTokens: true },
    });
    return { team, usedTokens: agg._sum.totalTokens || 0 };
  }

  // Teams with rolled-up usage/spend, for the dashboard (managers+).
  async listWithUsage(orgId: string, actorId: string) {
    await this.orgs.requireRole(orgId, actorId, "manager");
    const org = await this.prisma.organization.findUnique({ where: { id: orgId } });
    if (!org) return [];
    const teams = await this.prisma.team.findMany({
      where: { orgId },
      include: { members: { include: { user: { select: { email: true, name: true } } } } },
      orderBy: { createdAt: "asc" },
    });
    const out: TeamUsageRow[] = [];
    for (const t of teams) {
      const { usedTokens } = await this.teamUsage(t.id);
      const cost = org.tokensPerUnit > 0 ? (usedTokens / org.tokensPerUnit) * org.pricePerUnit : 0;
      out.push({
        id: t.id,
        name: t.name,
        tokenLimit: t.tokenLimit,
        budgetLimit: t.budgetLimit,
        limitPeriod: t.limitPeriod,
        memberCount: t.members.length,
        members: t.members.map((m) => ({ memberId: m.id, email: m.user.email, name: m.user.name })),
        usedTokens,
        usedCost: Math.round(cost * 10000) / 10000,
      });
    }
    return out;
  }
}
