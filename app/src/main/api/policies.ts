// Governance policies. `config` stays a JSON string on the wire because the
// renderer's policy editor already JSON.parses it.
import { col, query } from "../data/store";
import { audit, forbidden, notFound, requireRole, CAN_MANAGE_POLICIES } from "./shared";

const TYPES = ["content_filter", "pii", "model_allowlist", "rate_limit", "token_limit"];
const ACTIONS = ["block", "warn", "redact"];

export interface Policy {
  id: string;
  orgId: string | null;
  userId: string | null;
  type: string;
  name: string;
  enabled: boolean;
  action: string;
  config: string;
  createdAt: Date;
}

export interface PolicyInput {
  orgId?: string | null;
  userId?: string | null;
  type: string;
  name: string;
  enabled?: boolean;
  action?: string;
  config?: unknown;
}

export async function create(actorId: string, input: PolicyInput) {
  if (!TYPES.includes(input.type)) throw forbidden("Unknown policy type");
  if (input.action && !ACTIONS.includes(input.action)) throw forbidden("Unknown policy action");
  if (input.orgId) await requireRole(input.orgId, actorId, CAN_MANAGE_POLICIES);
  else input.userId = actorId; // a personal policy always belongs to the actor

  const doc = {
    orgId: input.orgId || null,
    userId: input.userId || null,
    type: input.type,
    name: input.name,
    enabled: input.enabled ?? true,
    action: input.action || "block",
    config: JSON.stringify(input.config ?? {}),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const id = await col("policies").add(doc);
  if (input.orgId) await audit(input.orgId, actorId, "policy.create", input.name);
  return { id, ...doc };
}

async function authorize(actorId: string, policyId: string): Promise<Policy> {
  const snap = await col("policies").doc(policyId).get<Omit<Policy, "id">>();
  const p = snap.data();
  if (!snap.exists || !p) throw notFound("Policy not found");
  if (p.orgId) await requireRole(p.orgId, actorId, CAN_MANAGE_POLICIES);
  else if (p.userId !== actorId) throw forbidden("Not your policy");
  return { id: policyId, ...p };
}

export async function update(actorId: string, policyId: string, patch: Record<string, unknown>) {
  const p = await authorize(actorId, policyId);
  if (patch.action && !ACTIONS.includes(String(patch.action))) {
    throw forbidden("Unknown policy action");
  }
  const data: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.name !== undefined) data.name = patch.name;
  if (patch.enabled !== undefined) data.enabled = patch.enabled;
  if (patch.action !== undefined) data.action = patch.action;
  if (patch.config !== undefined) data.config = JSON.stringify(patch.config);
  // Retargeting at a single member is an org-policy-only operation.
  if (p.orgId && patch.userId !== undefined) data.userId = patch.userId;

  await col("policies").doc(policyId).update(data);
  if (p.orgId) await audit(p.orgId, actorId, "policy.update", p.name);
  return { id: policyId, ...(await col("policies").doc(policyId).get()).data() };
}

export async function remove(actorId: string, policyId: string) {
  const p = await authorize(actorId, policyId);
  await col("policies").doc(policyId).delete();
  if (p.orgId) await audit(p.orgId, actorId, "policy.delete", p.name);
  return { success: true };
}

export async function forOrg(orgId: string, actorId: string) {
  await requireRole(orgId, actorId, CAN_MANAGE_POLICIES);
  return query("policies").where("orgId", "==", orgId).orderBy("createdAt", "asc").get<Policy>();
}

export async function personal(userId: string) {
  return query("policies")
    .where("orgId", "==", null)
    .where("userId", "==", userId)
    .orderBy("createdAt", "asc")
    .get<Policy>();
}

/**
 * Everything that applies to this user right now: their personal policies,
 * plus for every org they belong to, the org-wide ones and any aimed at them.
 *
 * Prisma expressed this as a single OR query. Firestore has no OR across
 * different fields, so this fans out per org and merges. Org policy counts are
 * small, so the extra reads are negligible.
 */
export async function effective(userId: string): Promise<Policy[]> {
  const members = await query("members").where("userId", "==", userId).get<{ orgId: string }>();

  const results = await Promise.all([
    query("policies")
      .where("orgId", "==", null)
      .where("userId", "==", userId)
      .where("enabled", "==", true)
      .get<Policy>(),
    ...members.map((m) =>
      query("policies").where("orgId", "==", m.orgId).where("enabled", "==", true).get<Policy>()
    ),
  ]);

  const seen = new Set<string>();
  const out: Policy[] = [];
  for (const rows of results) {
    for (const p of rows) {
      if (seen.has(p.id)) continue;
      // Org policies apply org-wide (userId null) or to exactly one member.
      if (p.orgId && p.userId !== null && p.userId !== userId) continue;
      seen.add(p.id);
      out.push(p);
    }
  }
  out.sort((a, b) => Number(a.createdAt) - Number(b.createdAt));
  return out;
}
