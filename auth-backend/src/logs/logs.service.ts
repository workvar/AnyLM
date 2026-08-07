import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { OrgsService } from "../orgs/orgs.service";

const MAX_FIELD = 8000; // keep stored prompts/responses bounded

@Injectable()
export class LogsService {
  constructor(private prisma: PrismaService, private orgs: OrgsService) {}

  // Store an interaction for every org of the user that has logging enabled.
  // Also prunes entries older than each org's retention window.
  async record(
    userId: string,
    data: { model: string; prompt: string; response: string; flags?: string[] }
  ) {
    const memberships = await this.prisma.orgMember.findMany({
      where: { userId },
      include: { org: true },
    });
    let stored = 0;
    for (const m of memberships) {
      if (!m.org.loggingEnabled) continue;
      await this.prisma.interactionLog.create({
        data: {
          orgId: m.orgId,
          userId,
          model: data.model || "unknown",
          prompt: (data.prompt || "").slice(0, MAX_FIELD),
          response: (data.response || "").slice(0, MAX_FIELD),
          flags: JSON.stringify(data.flags || []),
        },
      });
      stored += 1;
      const cutoff = new Date(Date.now() - m.org.retentionDays * 86400_000);
      await this.prisma.interactionLog.deleteMany({
        where: { orgId: m.orgId, createdAt: { lt: cutoff } },
      });
    }
    return { stored };
  }

  // Compliance review: list an org's logs (admins only), newest first.
  async list(orgId: string, actorId: string, query?: string, limit = 100) {
    await this.orgs.requireRole(orgId, actorId, "admin");
    const logs = await this.prisma.interactionLog.findMany({
      where: {
        orgId,
        ...(query
          ? { OR: [{ prompt: { contains: query } }, { response: { contains: query } }] }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: Math.min(limit, 500),
    });
    // Attach member emails for display.
    const users = await this.prisma.user.findMany({
      where: { id: { in: [...new Set(logs.map((l) => l.userId))] } },
      select: { id: true, email: true },
    });
    const emails = new Map(users.map((u) => [u.id, u.email]));
    return logs.map((l) => ({ ...l, email: emails.get(l.userId) || l.userId }));
  }

  async clear(orgId: string, actorId: string) {
    await this.orgs.requireRole(orgId, actorId, "admin");
    await this.prisma.interactionLog.deleteMany({ where: { orgId } });
    await this.orgs.audit(orgId, actorId, "logs.clear");
    return { success: true };
  }
}
