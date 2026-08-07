import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { OrgsService } from "../orgs/orgs.service";
import { PoliciesService } from "../policies/policies.service";
import { TeamsService } from "../teams/teams.service";
import { periodStart } from "../governance/periods";

export interface CheckResult {
  allowed: boolean;
  reason?: string;
  warnings: string[];
  remainingTokens: number | null;
}

export interface MemberLimits {
  orgId: string;
  orgName: string;
  role: string;
  tokenLimit: number | null;
  budgetLimit: number | null;
  budgetTokens: number | null;
  period: string;
  usedTokens: number;
  usedCost: number;
  tokensPerUnit: number;
  pricePerUnit: number;
  currency: string;
}

export interface MemberUsageRow {
  memberId: string;
  userId: string;
  email: string;
  name: string | null;
  role: string;
  tokenLimit: number | null;
  budgetLimit: number | null;
  period: string;
  usedTokens: number;
  allTimeTokens: number;
  usedCost: number;
}

@Injectable()
export class UsageService {
  constructor(
    private prisma: PrismaService,
    private orgs: OrgsService,
    private policies: PoliciesService,
    private teams: TeamsService
  ) {}

  private async sumTokens(userId: string, orgId: string | null, period: string) {
    const start = periodStart(period);
    const agg = await this.prisma.usageRecord.aggregate({
      where: {
        userId,
        ...(orgId ? { orgId } : {}),
        ...(start ? { createdAt: { gte: start } } : {}),
      },
      _sum: { totalTokens: true },
    });
    return agg._sum.totalTokens || 0;
  }

  // The user's limits across all memberships, plus current usage.
  async limitsFor(userId: string) {
    const memberships = await this.prisma.orgMember.findMany({
      where: { userId },
      include: { org: true },
    });
    const out: MemberLimits[] = [];
    for (const m of memberships) {
      const tokenLimit = m.tokenLimit ?? m.org.defaultTokenLimit ?? null;
      const period = m.tokenLimit != null ? m.limitPeriod : m.org.defaultLimitPeriod;
      const used = await this.sumTokens(userId, m.orgId, period);
      const { tokensPerUnit, pricePerUnit, currency } = m.org;
      const usedCost = tokensPerUnit > 0 ? (used / tokensPerUnit) * pricePerUnit : 0;
      // A money budget translates to an equivalent token ceiling.
      const budgetTokens =
        m.budgetLimit != null && pricePerUnit > 0
          ? Math.floor((m.budgetLimit / pricePerUnit) * tokensPerUnit)
          : null;
      out.push({
        orgId: m.orgId,
        orgName: m.org.name,
        role: m.role,
        tokenLimit,
        budgetLimit: m.budgetLimit,
        budgetTokens,
        period,
        usedTokens: used,
        usedCost: Math.round(usedCost * 10000) / 10000,
        tokensPerUnit,
        pricePerUnit,
        currency,
      });
    }
    return out;
  }

  // Pre-flight: may this user send a request to `model` right now?
  // `promptTokens` is the caller's estimate of the outgoing prompt size,
  // used by token_limit policies for per-request enforcement.
  async check(userId: string, model: string, promptTokens = 0): Promise<CheckResult> {
    const warnings: string[] = [];
    const limits = await this.limitsFor(userId);

    for (const l of limits) {
      const caps = [l.tokenLimit, l.budgetTokens].filter((c) => c != null) as number[];
      if (!caps.length) continue;
      const cap = Math.min(...caps);
      if (l.usedTokens >= cap) {
        const kind = l.budgetTokens != null && cap === l.budgetTokens ? "budget" : "token limit";
        return {
          allowed: false,
          reason: `Your ${l.period} ${kind} for ${l.orgName} is exhausted (${l.usedTokens.toLocaleString()} / ${cap.toLocaleString()} tokens). Contact your admin.`,
          warnings,
          remainingTokens: 0,
        };
      }
      if (l.usedTokens >= cap * 0.9)
        warnings.push(
          `You have used ${Math.round((l.usedTokens / cap) * 100)}% of your ${l.period} allowance for ${l.orgName}.`
        );
    }

    // Rolled-up team budgets: block when the whole team's pool is exhausted.
    const memberships = await this.prisma.orgMember.findMany({
      where: { userId, teamId: { not: null } },
      include: { org: true },
    });
    for (const m of memberships) {
      if (!m.teamId) continue;
      const { team, usedTokens } = await this.teams.teamUsage(m.teamId);
      if (!team) continue;
      const budgetTokens =
        team.budgetLimit != null && m.org.pricePerUnit > 0
          ? Math.floor((team.budgetLimit / m.org.pricePerUnit) * m.org.tokensPerUnit)
          : null;
      const caps = [team.tokenLimit, budgetTokens].filter((c) => c != null) as number[];
      if (!caps.length) continue;
      const cap = Math.min(...caps);
      if (usedTokens >= cap) {
        return {
          allowed: false,
          reason: `Your team "${team.name}" has exhausted its ${team.limitPeriod} allowance (${usedTokens.toLocaleString()} / ${cap.toLocaleString()} tokens).`,
          warnings,
          remainingTokens: 0,
        };
      }
      if (usedTokens >= cap * 0.9)
        warnings.push(`Team "${team.name}" has used ${Math.round((usedTokens / cap) * 100)}% of its ${team.limitPeriod} allowance.`);
    }

    // Rate-limit and model-allowlist policies (authoritative server side).
    const pols = await this.policies.effective(userId);
    for (const p of pols) {
      const cfg = parse(p.config);
      if (p.type === "model_allowlist") {
        const allowed: string[] = Array.isArray(cfg.models) ? cfg.models : [];
        if (allowed.length && !allowed.includes(model)) {
          if (p.action === "warn") warnings.push(`Model "${model}" is outside the allowed list (${p.name}).`);
          else
            return {
              allowed: false,
              reason: `Model "${model}" is not allowed by policy "${p.name}". Allowed: ${allowed.join(", ")}.`,
              warnings,
              remainingTokens: null,
            };
        }
      }
      if (p.type === "rate_limit") {
        const res = await this.checkRate(userId, p.name, cfg, p.action, warnings);
        if (res) return { ...res, warnings };
      }
      if (p.type === "token_limit") {
        const res = await this.checkTokens(userId, p.name, cfg, p.action, promptTokens, warnings);
        if (res) return { ...res, warnings };
      }
    }

    const remaining = limits
      .map((l) => {
        const caps = [l.tokenLimit, l.budgetTokens].filter((c) => c != null) as number[];
        return caps.length ? Math.min(...caps) - l.usedTokens : null;
      })
      .filter((r) => r != null) as number[];

    return {
      allowed: true,
      warnings,
      remainingTokens: remaining.length ? Math.max(0, Math.min(...remaining)) : null,
    };
  }

  private async checkRate(
    userId: string,
    name: string,
    cfg: Record<string, unknown>,
    action: string,
    warnings: string[]
  ): Promise<CheckResult | null> {
    // Allowed hours window (e.g. 9-18). Empty = always allowed.
    const startHour = num(cfg.startHour);
    const endHour = num(cfg.endHour);
    if (startHour != null && endHour != null) {
      const h = new Date().getHours();
      const inWindow = startHour <= endHour ? h >= startHour && h < endHour : h >= startHour || h < endHour;
      if (!inWindow) {
        const msg = `LLM access is limited to ${startHour}:00–${endHour}:00 by policy "${name}".`;
        if (action === "warn") warnings.push(msg);
        else return { allowed: false, reason: msg, warnings: [], remainingTokens: null };
      }
    }
    const maxPerHour = num(cfg.maxPerHour);
    if (maxPerHour != null && maxPerHour > 0) {
      const since = new Date(Date.now() - 3600_000);
      const count = await this.prisma.usageRecord.count({
        where: { userId, createdAt: { gte: since } },
      });
      if (count >= maxPerHour) {
        const msg = `Hourly request limit reached (${maxPerHour}/hour, policy "${name}"). Try again later.`;
        if (action === "warn") warnings.push(msg);
        else return { allowed: false, reason: msg, warnings: [], remainingTokens: null };
      }
    }
    return null;
  }

  // token_limit policies: per-request prompt size and per-day consumption.
  private async checkTokens(
    userId: string,
    name: string,
    cfg: Record<string, unknown>,
    action: string,
    promptTokens: number,
    warnings: string[]
  ): Promise<CheckResult | null> {
    const maxPerRequest = num(cfg.maxPerRequest);
    if (maxPerRequest != null && maxPerRequest > 0 && promptTokens > maxPerRequest) {
      const msg = `Prompt is ~${promptTokens.toLocaleString()} tokens; policy "${name}" allows ${maxPerRequest.toLocaleString()} per request.`;
      if (action === "warn") warnings.push(msg);
      else return { allowed: false, reason: msg, warnings: [], remainingTokens: null };
    }
    const maxPerDay = num(cfg.maxPerDay);
    if (maxPerDay != null && maxPerDay > 0) {
      const used = await this.sumTokens(userId, null, "daily");
      if (used >= maxPerDay) {
        const msg = `Daily token limit reached (${used.toLocaleString()} / ${maxPerDay.toLocaleString()}, policy "${name}").`;
        if (action === "warn") warnings.push(msg);
        else return { allowed: false, reason: msg, warnings: [], remainingTokens: 0 };
      } else if (used >= maxPerDay * 0.9) {
        warnings.push(
          `You have used ${Math.round((used / maxPerDay) * 100)}% of your daily token allowance (policy "${name}").`
        );
      }
    }
    return null;
  }

  // Record a completed request's token consumption.
  async report(
    userId: string,
    data: { model: string; promptTokens?: number; completionTokens?: number }
  ) {
    const prompt = Math.max(0, Math.round(data.promptTokens || 0));
    const completion = Math.max(0, Math.round(data.completionTokens || 0));
    const memberships = await this.prisma.orgMember.findMany({ where: { userId } });
    // Attribute usage to the user's primary org (first membership) if any.
    const orgId = memberships[0]?.orgId || null;
    return this.prisma.usageRecord.create({
      data: {
        userId,
        orgId,
        model: data.model || "unknown",
        promptTokens: prompt,
        completionTokens: completion,
        totalTokens: prompt + completion,
      },
    });
  }

  // Raw usage records as CSV for export (managers+).
  async exportCsv(orgId: string, actorId: string): Promise<string> {
    await this.orgs.requireRole(orgId, actorId, "manager");
    const org = await this.prisma.organization.findUnique({ where: { id: orgId } });
    const records = await this.prisma.usageRecord.findMany({
      where: { orgId },
      include: { user: { select: { email: true } } },
      orderBy: { createdAt: "desc" },
      take: 10000,
    });
    const rate = org && org.tokensPerUnit > 0 ? org.pricePerUnit / org.tokensPerUnit : 0;
    const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
    const currency = org ? org.currency : "USD";
    const lines = [
      `timestamp,email,model,prompt_tokens,completion_tokens,total_tokens,cost_${currency}`,
    ];
    for (const r of records) {
      lines.push(
        [
          r.createdAt.toISOString(),
          esc(r.user.email),
          esc(r.model),
          r.promptTokens,
          r.completionTokens,
          r.totalTokens,
          (r.totalTokens * rate).toFixed(4),
        ].join(",")
      );
    }
    return lines.join("\n");
  }

  // Per-member usage summary for the org dashboard (managers+).
  async orgSummary(orgId: string, actorId: string) {
    await this.orgs.requireRole(orgId, actorId, "manager");
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      include: {
        members: { include: { user: { select: { id: true, email: true, name: true } } } },
      },
    });
    if (!org) return null;
    const rows: MemberUsageRow[] = [];
    for (const m of org.members) {
      const tokenLimit = m.tokenLimit ?? org.defaultTokenLimit ?? null;
      const period = m.tokenLimit != null ? m.limitPeriod : org.defaultLimitPeriod;
      const used = await this.sumTokens(m.userId, orgId, period);
      const allTime = await this.sumTokens(m.userId, orgId, "lifetime");
      const cost =
        org.tokensPerUnit > 0 ? (used / org.tokensPerUnit) * org.pricePerUnit : 0;
      rows.push({
        memberId: m.id,
        userId: m.userId,
        email: m.user.email,
        name: m.user.name,
        role: m.role,
        tokenLimit,
        budgetLimit: m.budgetLimit,
        period,
        usedTokens: used,
        allTimeTokens: allTime,
        usedCost: Math.round(cost * 10000) / 10000,
      });
    }
    const totalTokens = rows.reduce((n, r) => n + r.usedTokens, 0);
    const totalCost = rows.reduce((n, r) => n + r.usedCost, 0);
    return {
      currency: org.currency,
      tokensPerUnit: org.tokensPerUnit,
      pricePerUnit: org.pricePerUnit,
      totalTokens,
      totalCost: Math.round(totalCost * 10000) / 10000,
      members: rows,
    };
  }
}

function parse(json: string): Record<string, unknown> {
  try {
    return JSON.parse(json) || {};
  } catch {
    return {};
  }
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
