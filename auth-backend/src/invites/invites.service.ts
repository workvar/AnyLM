import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { OrgsService } from "../orgs/orgs.service";
import { CAN_MANAGE_MEMBERS } from "../orgs/roles";

const INVITE_ROLES = ["member", "manager", "admin"];

@Injectable()
export class InvitesService {
  constructor(private prisma: PrismaService, private orgs: OrgsService) {}

  // Admin creates a pending invitation (no instant membership).
  async create(orgId: string, actorId: string, email: string, role: string) {
    await this.orgs.requireRole(orgId, actorId, CAN_MANAGE_MEMBERS);
    const clean = email.trim().toLowerCase();
    if (!clean) throw new ForbiddenException("Email required");
    const user = await this.prisma.user.findUnique({ where: { email: clean } });
    if (user) {
      const existing = await this.prisma.orgMember.findUnique({
        where: { orgId_userId: { orgId, userId: user.id } },
      });
      if (existing) throw new ForbiddenException("Already a member");
    }
    // Re-inviting supersedes any previous non-pending invite.
    const prior = await this.prisma.invite.findFirst({
      where: { orgId, email: clean, status: "pending" },
    });
    if (prior) return prior;
    const invite = await this.prisma.invite.create({
      data: { orgId, email: clean, role: INVITE_ROLES.includes(role) ? role : "member", invitedBy: actorId },
    });
    await this.orgs.audit(orgId, actorId, "invite.create", `${clean} as ${invite.role}`);
    return invite;
  }

  async listForOrg(orgId: string, actorId: string) {
    await this.orgs.requireRole(orgId, actorId, CAN_MANAGE_MEMBERS);
    return this.prisma.invite.findMany({
      where: { orgId, status: "pending" },
      orderBy: { createdAt: "desc" },
    });
  }

  async revoke(orgId: string, actorId: string, inviteId: string) {
    await this.orgs.requireRole(orgId, actorId, CAN_MANAGE_MEMBERS);
    const invite = await this.prisma.invite.findUnique({ where: { id: inviteId } });
    if (!invite || invite.orgId !== orgId) throw new NotFoundException("Invite not found");
    await this.prisma.invite.update({
      where: { id: inviteId },
      data: { status: "revoked", respondedAt: new Date() },
    });
    await this.orgs.audit(orgId, actorId, "invite.revoke", invite.email);
    return { success: true };
  }

  // Pending invitations addressed to the signed-in user.
  async mine(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) return [];
    return this.prisma.invite.findMany({
      where: { email: user.email.toLowerCase(), status: "pending" },
      include: { org: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  private async respond(userId: string, inviteId: string, accept: boolean) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const invite = await this.prisma.invite.findUnique({ where: { id: inviteId } });
    if (!user || !invite || invite.status !== "pending")
      throw new NotFoundException("Invite not found");
    if (invite.email !== user.email.toLowerCase())
      throw new ForbiddenException("This invitation is not for you");
    await this.prisma.invite.update({
      where: { id: inviteId },
      data: { status: accept ? "accepted" : "declined", respondedAt: new Date() },
    });
    if (accept) {
      await this.prisma.orgMember.upsert({
        where: { orgId_userId: { orgId: invite.orgId, userId } },
        create: { orgId: invite.orgId, userId, role: invite.role },
        update: {},
      });
      await this.orgs.audit(invite.orgId, userId, "invite.accept", user.email);
    }
    return { success: true, accepted: accept, orgId: invite.orgId };
  }

  accept(userId: string, inviteId: string) {
    return this.respond(userId, inviteId, true);
  }

  decline(userId: string, inviteId: string) {
    return this.respond(userId, inviteId, false);
  }
}
