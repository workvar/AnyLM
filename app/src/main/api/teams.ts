// Teams: a budget pool shared by a subset of an org's members.
import { col, query, updateMany } from "../data/store";
import { audit, notFound, requireRole, sumTokensForUsers } from "./shared";
import { orgDoc } from "./orgs";
import { usersByIds } from "./users";

export interface Team {
  id: string;
  orgId: string;
  name: string;
  tokenLimit: number | null;
  budgetLimit: number | null;
  limitPeriod: string;
  createdAt: Date;
}

export async function create(orgId: string, actorId: string, name: string) {
  await requireRole(orgId, actorId, "admin");
  const doc = {
    orgId,
    name,
    tokenLimit: null,
    budgetLimit: null,
    limitPeriod: "monthly",
    createdAt: new Date(),
  };
  const id = await col("teams").add(doc);
  await audit(orgId, actorId, "team.create", name);
  return { id, ...doc };
}

export async function update(
  orgId: string,
  actorId: string,
  teamId: string,
  patch: Record<string, unknown>
) {
  await requireRole(orgId, actorId, "admin");
  const ref = col("teams").doc(teamId);
  const snap = await ref.get<Omit<Team, "id">>();
  const team = snap.data();
  if (!snap.exists || !team || team.orgId !== orgId) throw notFound("Team not found");

  const data: Record<string, unknown> = {};
  for (const k of ["name", "tokenLimit", "budgetLimit", "limitPeriod"]) {
    if (patch[k] !== undefined) data[k] = patch[k];
  }
  await ref.update(data);
  await audit(orgId, actorId, "team.update", JSON.stringify({ teamId, ...data }));
  return { id: teamId, ...(await ref.get()).data() };
}

export async function remove(orgId: string, actorId: string, teamId: string) {
  await requireRole(orgId, actorId, "admin");
  const ref = col("teams").doc(teamId);
  const snap = await ref.get<Omit<Team, "id">>();
  const team = snap.data();
  if (!snap.exists || !team || team.orgId !== orgId) throw notFound("Team not found");

  // Prisma used onDelete: SetNull for member.teamId; do it by hand.
  const members = await query("members").where("teamId", "==", teamId).get();
  await updateMany("members", members.map((m) => m.id), { teamId: null });
  await ref.delete();
  await audit(orgId, actorId, "team.delete", team.name);
  return { success: true };
}

/** Tokens consumed by a team's current members within the team's period. */
export async function teamUsage(teamId: string) {
  const snap = await col("teams").doc(teamId).get<Omit<Team, "id">>();
  const data = snap.data();
  if (!snap.exists || !data) return { team: null, usedTokens: 0 };
  const team: Team = { id: teamId, ...data };

  const members = await query("members").where("teamId", "==", teamId).get<{ userId: string }>();
  const usedTokens = await sumTokensForUsers(
    team.orgId,
    members.map((m) => m.userId),
    team.limitPeriod
  );
  return { team, usedTokens };
}

/** Teams with rolled-up usage and spend, for the dashboard (managers+). */
export async function listWithUsage(orgId: string, actorId: string) {
  await requireRole(orgId, actorId, "manager");
  const org = (await orgDoc(orgId)) as unknown as { tokensPerUnit: number; pricePerUnit: number } | null;
  if (!org) return [];

  const teams = await query("teams")
    .where("orgId", "==", orgId)
    .orderBy("createdAt", "asc")
    .get<Omit<Team, "id">>();

  const out = [];
  for (const t of teams) {
    const members = await query("members").where("teamId", "==", t.id).get<{ userId: string }>();
    const users = await usersByIds(members.map((m) => m.userId));
    const usedTokens = await sumTokensForUsers(orgId, members.map((m) => m.userId), t.limitPeriod);
    const cost = org.tokensPerUnit > 0 ? (usedTokens / org.tokensPerUnit) * org.pricePerUnit : 0;
    out.push({
      id: t.id,
      name: t.name,
      tokenLimit: t.tokenLimit,
      budgetLimit: t.budgetLimit,
      limitPeriod: t.limitPeriod,
      memberCount: members.length,
      members: members.map((m) => ({
        memberId: m.id,
        email: users.get(m.userId)?.email || m.userId,
        name: users.get(m.userId)?.name ?? null,
      })),
      usedTokens,
      usedCost: Math.round(cost * 10000) / 10000,
    });
  }
  return out;
}
