import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { OrgsService } from "../orgs/orgs.service";
import { CAN_MANAGE_POLICIES } from "../orgs/roles";

const TYPES = ["content_filter", "pii", "model_allowlist", "rate_limit", "token_limit"];
const ACTIONS = ["block", "warn", "redact"];

export interface PolicyInput {
  orgId?: string | null;
  userId?: string | null; // org member target (org policies only)
  type: string;
  name: string;
  enabled?: boolean;
  action?: string;
  config?: unknown;
}

@Injectable()
export class PoliciesService {
  constructor(private prisma: PrismaService, private orgs: OrgsService) {}

  private validate(input: PolicyInput) {
    if (!TYPES.includes(input.type)) throw new ForbiddenException("Unknown policy type");
    if (input.action && !ACTIONS.includes(input.action))
      throw new ForbiddenException("Unknown policy action");
  }

  // Personal policies (self-governance) or org policies (role-gated).
  async create(actorId: string, input: PolicyInput) {
    this.validate(input);
    if (input.orgId) {
      await this.orgs.requireRole(input.orgId, actorId, CAN_MANAGE_POLICIES);
    } else {
      input.userId = actorId; // personal policy always belongs to the actor
    }
    const policy = await this.prisma.policy.create({
      data: {
        orgId: input.orgId || null,
        userId: input.userId || null,
        type: input.type,
        name: input.name,
        enabled: input.enabled ?? true,
        action: input.action || "block",
        config: JSON.stringify(input.config ?? {}),
      },
    });
    if (input.orgId) await this.orgs.audit(input.orgId, actorId, "policy.create", input.name);
    return policy;
  }

  private async authorize(actorId: string, policyId: string) {
    const p = await this.prisma.policy.findUnique({ where: { id: policyId } });
    if (!p) throw new NotFoundException("Policy not found");
    if (p.orgId) await this.orgs.requireRole(p.orgId, actorId, CAN_MANAGE_POLICIES);
    else if (p.userId !== actorId) throw new ForbiddenException("Not your policy");
    return p;
  }

  async update(
    actorId: string,
    policyId: string,
    patch: { name?: string; enabled?: boolean; action?: string; config?: unknown; userId?: string | null }
  ) {
    const p = await this.authorize(actorId, policyId);
    if (patch.action && !ACTIONS.includes(patch.action))
      throw new ForbiddenException("Unknown policy action");
    const updated = await this.prisma.policy.update({
      where: { id: policyId },
      data: {
        name: patch.name,
        enabled: patch.enabled,
        action: patch.action,
        ...(patch.config !== undefined ? { config: JSON.stringify(patch.config) } : {}),
        ...(p.orgId && patch.userId !== undefined ? { userId: patch.userId } : {}),
      },
    });
    if (p.orgId) await this.orgs.audit(p.orgId, actorId, "policy.update", p.name);
    return updated;
  }

  async remove(actorId: string, policyId: string) {
    const p = await this.authorize(actorId, policyId);
    await this.prisma.policy.delete({ where: { id: policyId } });
    if (p.orgId) await this.orgs.audit(p.orgId, actorId, "policy.delete", p.name);
    return { success: true };
  }

  // All policies for an org (managers+).
  async forOrg(orgId: string, actorId: string) {
    await this.orgs.requireRole(orgId, actorId, CAN_MANAGE_POLICIES);
    return this.prisma.policy.findMany({ where: { orgId }, orderBy: { createdAt: "asc" } });
  }

  // The user's own personal policies.
  personal(userId: string) {
    return this.prisma.policy.findMany({
      where: { orgId: null, userId },
      orderBy: { createdAt: "asc" },
    });
  }

  // Everything that applies to this user right now: personal policies plus,
  // for every org they belong to, org-wide policies and member-targeted ones.
  async effective(userId: string) {
    const memberships = await this.prisma.orgMember.findMany({ where: { userId } });
    const orgIds = memberships.map((m) => m.orgId);
    const or: object[] = [{ orgId: null, userId }];
    if (orgIds.length)
      or.push({ orgId: { in: orgIds }, OR: [{ userId: null }, { userId }] });
    return this.prisma.policy.findMany({
      where: { enabled: true, OR: or },
      orderBy: { createdAt: "asc" },
    });
  }
}
