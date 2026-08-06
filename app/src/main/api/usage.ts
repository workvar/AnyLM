// Usage accounting: what a member is allowed, what they have spent, and the
// dashboard and export views over it. Enforcement lives in usage-check.ts.
import { query, addStamped } from "../data/store";
import { Member, requireRole, sumTokens } from "./shared";
import { orgDoc } from "./orgs";
import { usersByIds } from "./users";

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

interface OrgShape {
  name: string;
  tokensPerUnit: number;
  pricePerUnit: number;
  currency: string;
  defaultTokenLimit: number | null;
  defaultLimitPeriod: string;
}

/** The user's limits across every membership, plus current consumption. */
export async function limitsFor(userId: string): Promise<MemberLimits[]> {
  const members = await query("members").where("userId", "==", userId).get<Omit<Member, "id">>();

  const out: MemberLimits[] = [];
  for (const m of members) {
    const org = (await orgDoc(m.orgId)) as unknown as OrgShape | null;
    if (!org) continue;
    const tokenLimit = m.tokenLimit ?? org.defaultTokenLimit ?? null;
    const period = m.tokenLimit != null ? m.limitPeriod : org.defaultLimitPeriod;
    const used = await sumTokens(userId, m.orgId, period);
    const { tokensPerUnit, pricePerUnit, currency } = org;
    const usedCost = tokensPerUnit > 0 ? (used / tokensPerUnit) * pricePerUnit : 0;
    // A money budget translates to an equivalent token ceiling.
    const budgetTokens =
      m.budgetLimit != null && pricePerUnit > 0
        ? Math.floor((m.budgetLimit / pricePerUnit) * tokensPerUnit)
        : null;
    out.push({
      orgId: m.orgId,
      orgName: org.name,
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

/**
 * Record a completed request's token consumption.
 *
 * `createdAt` is stamped by Firestore, not by us, because the rules require
 * it. That is what stops a client backdating rows into a spent window to make
 * a fresh allowance appear.
 */
export async function report(
  userId: string,
  data: { model?: string; promptTokens?: number; completionTokens?: number }
) {
  const prompt = Math.max(0, Math.round(data.promptTokens || 0));
  const completion = Math.max(0, Math.round(data.completionTokens || 0));
  const first = await query("members").where("userId", "==", userId).limit(1).first<{ orgId: string }>();

  const row = {
    userId,
    orgId: first ? first.orgId : null,
    model: data.model || "unknown",
    promptTokens: prompt,
    completionTokens: completion,
    totalTokens: prompt + completion,
  };
  const id = await addStamped("usage", row);
  return { id, ...row, createdAt: new Date().toISOString() };
}

/** Raw usage records as CSV for export (managers+). */
export async function exportCsv(orgId: string, actorId: string): Promise<string> {
  await requireRole(orgId, actorId, "manager");
  const org = (await orgDoc(orgId)) as unknown as OrgShape | null;
  const records = await query("usage")
    .where("orgId", "==", orgId)
    .orderBy("createdAt", "desc")
    .limit(10000)
    .get<{
      userId: string;
      model: string;
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
      createdAt: Date;
    }>();

  const users = await usersByIds(records.map((r) => r.userId));
  const rate = org && org.tokensPerUnit > 0 ? org.pricePerUnit / org.tokensPerUnit : 0;
  const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
  const currency = org ? org.currency : "USD";

  const lines = [
    `timestamp,email,model,prompt_tokens,completion_tokens,total_tokens,cost_${currency}`,
  ];
  for (const r of records) {
    lines.push(
      [
        new Date(r.createdAt).toISOString(),
        esc(users.get(r.userId)?.email || r.userId),
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

/** Per-member usage summary for the org dashboard (managers+). */
export async function orgSummary(orgId: string, actorId: string) {
  await requireRole(orgId, actorId, "manager");
  const org = (await orgDoc(orgId)) as unknown as OrgShape | null;
  if (!org) return null;

  const members = await query("members").where("orgId", "==", orgId).get<Omit<Member, "id">>();
  const users = await usersByIds(members.map((m) => m.userId));

  const rows = [];
  for (const m of members) {
    const tokenLimit = m.tokenLimit ?? org.defaultTokenLimit ?? null;
    const period = m.tokenLimit != null ? m.limitPeriod : org.defaultLimitPeriod;
    const used = await sumTokens(m.userId, orgId, period);
    const allTime = await sumTokens(m.userId, orgId, "lifetime");
    const cost = org.tokensPerUnit > 0 ? (used / org.tokensPerUnit) * org.pricePerUnit : 0;
    rows.push({
      memberId: m.id,
      userId: m.userId,
      email: users.get(m.userId)?.email || m.userId,
      name: users.get(m.userId)?.name ?? null,
      role: m.role,
      tokenLimit,
      budgetLimit: m.budgetLimit,
      period,
      usedTokens: used,
      allTimeTokens: allTime,
      usedCost: Math.round(cost * 10000) / 10000,
    });
  }

  return {
    currency: org.currency,
    tokensPerUnit: org.tokensPerUnit,
    pricePerUnit: org.pricePerUnit,
    totalTokens: rows.reduce((n, r) => n + r.usedTokens, 0),
    totalCost: Math.round(rows.reduce((n, r) => n + r.usedCost, 0) * 10000) / 10000,
    members: rows,
  };
}
