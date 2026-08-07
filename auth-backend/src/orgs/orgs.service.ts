import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { atLeast, Role, CAN_MANAGE_MEMBERS } from "./roles";

@Injectable()
export class OrgsService {
  constructor(private prisma: PrismaService) {}

  // ---- membership helpers ----

  async membership(orgId: string, userId: string) {
    const m = await this.prisma.orgMember.findUnique({
      where: { orgId_userId: { orgId, userId } },
    });
    if (!m) throw new ForbiddenException("Not a member of this organization");
    return m;
  }

  async requireRole(orgId: string, userId: string, min: Role) {
    const m = await this.membership(orgId, userId);
    if (!atLeast(m.role, min)) throw new ForbiddenException("Insufficient role");
    return m;
  }

  async audit(orgId: string, actorId: string, action: string, detail?: string) {
    await this.prisma.auditLog.create({
      data: { orgId, actorId, action, detail: detail || null },
    });
  }

  // ---- orgs ----

  async create(userId: string, name: string) {
    const org = await this.prisma.organization.create({
      data: {
        name,
        members: { create: { userId, role: "owner" } },
      },
    });
    await this.audit(org.id, userId, "org.create", name);
    return org;
  }

  // Orgs the user belongs to, with their role.
  mine(userId: string) {
    return this.prisma.orgMember.findMany({
      where: { userId },
      include: { org: true },
    });
  }

  async get(orgId: string, userId: string) {
    const me = await this.membership(orgId, userId);
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      include: {
        members: {
          include: { user: { select: { id: true, email: true, name: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (!org) throw new NotFoundException("Organization not found");
    return { ...org, myRole: me.role };
  }

  // Only these org fields are admin-editable via PATCH /orgs/:id.
  private static EDITABLE = [
    "name",
    "tokensPerUnit",
    "pricePerUnit",
    "currency",
    "defaultTokenLimit",
    "defaultLimitPeriod",
    "ssoProvider",
    "ssoRequired",
    "autoJoinDomains",
    "loggingEnabled",
    "retentionDays",
    "chromaUrl",
  ];

  async update(orgId: string, userId: string, patch: Record<string, unknown>) {
    await this.requireRole(orgId, userId, "admin");
    const data: Record<string, unknown> = {};
    for (const k of OrgsService.EDITABLE) {
      if (patch[k] !== undefined) data[k] = patch[k];
    }
    const org = await this.prisma.organization.update({
      where: { id: orgId },
      data,
    });
    await this.audit(orgId, userId, "org.update", JSON.stringify(data));
    return org;
  }

  async remove(orgId: string, userId: string) {
    await this.requireRole(orgId, userId, "owner");
    await this.prisma.organization.delete({ where: { id: orgId } });
    return { success: true };
  }

  // ---- members ----

  async addMember(orgId: string, actorId: string, email: string, role: string) {
    await this.requireRole(orgId, actorId, CAN_MANAGE_MEMBERS);
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });
    if (!user) throw new NotFoundException("No user with that email");
    const member = await this.prisma.orgMember.upsert({
      where: { orgId_userId: { orgId, userId: user.id } },
      create: { orgId, userId: user.id, role: safeRole(role) },
      update: {},
    });
    await this.audit(orgId, actorId, "member.add", `${email} as ${role}`);
    return member;
  }

  async updateMember(
    orgId: string,
    actorId: string,
    memberId: string,
    patch: {
      role?: string;
      tokenLimit?: number | null;
      limitPeriod?: string;
      budgetLimit?: number | null;
      teamId?: string | null;
    }
  ) {
    const actor = await this.requireRole(orgId, actorId, CAN_MANAGE_MEMBERS);
    const target = await this.prisma.orgMember.findUnique({ where: { id: memberId } });
    if (!target || target.orgId !== orgId) throw new NotFoundException("Member not found");
    if (target.role === "owner" && actor.role !== "owner")
      throw new ForbiddenException("Only the owner can modify the owner");
    if (patch.role) patch.role = safeRole(patch.role);
    if (patch.role === "owner") throw new ForbiddenException("Ownership transfer not supported here");
    const updated = await this.prisma.orgMember.update({
      where: { id: memberId },
      data: patch,
    });
    await this.audit(orgId, actorId, "member.update", JSON.stringify({ memberId, ...patch }));
    return updated;
  }

  async removeMember(orgId: string, actorId: string, memberId: string) {
    await this.requireRole(orgId, actorId, CAN_MANAGE_MEMBERS);
    const target = await this.prisma.orgMember.findUnique({ where: { id: memberId } });
    if (!target || target.orgId !== orgId) throw new NotFoundException("Member not found");
    if (target.role === "owner") throw new ForbiddenException("Cannot remove the owner");
    await this.prisma.orgMember.delete({ where: { id: memberId } });
    await this.audit(orgId, actorId, "member.remove", memberId);
    return { success: true };
  }

  // ---- audit ----

  async auditLog(orgId: string, userId: string, limit = 100) {
    await this.requireRole(orgId, userId, "manager");
    return this.prisma.auditLog.findMany({
      where: { orgId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }
}

function safeRole(role: string): string {
  return ["member", "manager", "admin"].includes(role) ? role : "member";
}
