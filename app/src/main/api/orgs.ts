// Organizations, membership and roles.
import { col, query, getMany, deleteWhere, Row } from "../data/store";
import {
  Member,
  audit,
  forbidden,
  memberId,
  notFound,
  requireRole,
  membership,
  safeRole,
  CAN_MANAGE_MEMBERS,
} from "./shared";
import { findByEmail, usersByIds } from "./users";

const ORG_DEFAULTS = {
  tokensPerUnit: 1000,
  pricePerUnit: 0,
  currency: "USD",
  defaultTokenLimit: null as number | null,
  defaultLimitPeriod: "monthly",
  loggingEnabled: false,
  retentionDays: 30,
  chromaUrl: "",
};

// Only these are admin-editable. ssoProvider / ssoRequired / autoJoinDomains
// are gone: neither can be enforced without a server, so keeping the fields
// would imply a guarantee the app cannot make.
const EDITABLE = [
  "name",
  "tokensPerUnit",
  "pricePerUnit",
  "currency",
  "defaultTokenLimit",
  "defaultLimitPeriod",
  "loggingEnabled",
  "retentionDays",
  "chromaUrl",
];

const BLANK_MEMBER = {
  tokenLimit: null,
  limitPeriod: "monthly",
  budgetLimit: null,
  teamId: null,
};

export async function create(userId: string, name: string) {
  // createdBy is what the rules check before letting the caller claim owner.
  const orgId = await col("orgs").add({
    ...ORG_DEFAULTS,
    name,
    createdBy: userId,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  await col("members").doc(memberId(orgId, userId)).set({
    ...BLANK_MEMBER,
    orgId,
    userId,
    role: "owner",
    createdAt: new Date(),
  });
  await audit(orgId, userId, "org.create", name);
  return { id: orgId, ...ORG_DEFAULTS, name, createdBy: userId };
}

/** Orgs the user belongs to, each with the org document attached. */
export async function mine(userId: string) {
  const members = await query("members").where("userId", "==", userId).get<Omit<Member, "id">>();
  const orgs = await getMany("orgs", members.map((m) => m.orgId));
  return members
    .map((m) => ({ ...m, org: orgs.has(m.orgId) ? { id: m.orgId, ...orgs.get(m.orgId) } : null }))
    .filter((m) => m.org);
}

export async function get(orgId: string, userId: string) {
  const me = await membership(orgId, userId);
  const snap = await col("orgs").doc(orgId).get();
  if (!snap.exists) throw notFound("Organization not found");

  const members = await query("members")
    .where("orgId", "==", orgId)
    .orderBy("createdAt", "asc")
    .get<Omit<Member, "id">>();
  const users = await usersByIds(members.map((m) => m.userId));

  return {
    id: orgId,
    ...snap.data(),
    members: members.map((m) => ({
      ...m,
      user: { id: m.userId, ...users.get(m.userId) },
    })),
    myRole: me.role,
  };
}

export async function update(orgId: string, userId: string, patch: Record<string, unknown>) {
  await requireRole(orgId, userId, "admin");
  const data: Record<string, unknown> = {};
  for (const k of EDITABLE) if (patch[k] !== undefined) data[k] = patch[k];
  data.updatedAt = new Date();
  await col("orgs").doc(orgId).update(data);
  await audit(orgId, userId, "org.update", JSON.stringify(data));
  const snap = await col("orgs").doc(orgId).get();
  return { id: orgId, ...snap.data() };
}

export async function remove(orgId: string, userId: string) {
  await requireRole(orgId, userId, "owner");
  // Firestore has no cascading delete, so every collection that referenced
  // this org has to be swept by hand. Usage is deliberately left alone: the
  // rules make it immutable, and it is the one record we never destroy.
  for (const c of ["members", "teams", "invites", "policies", "interactionLogs", "audit"]) {
    await deleteWhere(c, "orgId", orgId);
  }
  await col("orgs").doc(orgId).delete();
  return { success: true };
}

// --- members -----------------------------------------------------------------

export async function addMember(orgId: string, actorId: string, email: string, role: string) {
  await requireRole(orgId, actorId, CAN_MANAGE_MEMBERS);
  const user = await findByEmail(email);
  if (!user) throw notFound("No user with that email");

  const ref = col("members").doc(memberId(orgId, user.id));
  if (!(await ref.exists())) {
    await ref.set({
      ...BLANK_MEMBER,
      orgId,
      userId: user.id,
      role: safeRole(role),
      createdAt: new Date(),
    });
  }
  await audit(orgId, actorId, "member.add", `${email} as ${role}`);
  const snap = await ref.get();
  return { id: ref.id, ...snap.data() };
}

export async function updateMember(
  orgId: string,
  actorId: string,
  docId: string,
  patch: Record<string, unknown>
) {
  const actor = await requireRole(orgId, actorId, CAN_MANAGE_MEMBERS);
  const ref = col("members").doc(docId);
  const snap = await ref.get<Omit<Member, "id">>();
  const target = snap.data();
  if (!snap.exists || !target || target.orgId !== orgId) throw notFound("Member not found");
  if (target.role === "owner" && actor.role !== "owner") {
    throw forbidden("Only the owner can modify the owner");
  }
  if (patch.role) patch.role = safeRole(String(patch.role));
  if (patch.role === "owner") throw forbidden("Ownership transfer not supported here");

  const data: Record<string, unknown> = {};
  for (const k of ["role", "tokenLimit", "limitPeriod", "budgetLimit", "teamId"]) {
    if (patch[k] !== undefined) data[k] = patch[k];
  }
  await ref.update(data);
  await audit(orgId, actorId, "member.update", JSON.stringify({ memberId: docId, ...data }));
  return { id: docId, ...(await ref.get()).data() };
}

export async function removeMember(orgId: string, actorId: string, docId: string) {
  await requireRole(orgId, actorId, CAN_MANAGE_MEMBERS);
  const snap = await col("members").doc(docId).get<Omit<Member, "id">>();
  const target = snap.data();
  if (!snap.exists || !target || target.orgId !== orgId) throw notFound("Member not found");
  if (target.role === "owner") throw forbidden("Cannot remove the owner");
  await col("members").doc(docId).delete();
  await audit(orgId, actorId, "member.remove", docId);
  return { success: true };
}

export async function auditLog(orgId: string, userId: string, limit = 100) {
  await requireRole(orgId, userId, "manager");
  return query("audit")
    .where("orgId", "==", orgId)
    .orderBy("createdAt", "desc")
    .limit(Math.min(limit, 500))
    .get();
}

export async function orgDoc(orgId: string): Promise<Row | null> {
  const snap = await col("orgs").doc(orgId).get();
  return snap.exists ? { id: orgId, ...snap.data() } : null;
}
