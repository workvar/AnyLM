// Organization invitations, from both the admin and invitee sides.
//
// Invitations carry more weight than they used to: with no server, domain
// auto-join is gone, so this is the only path into an org besides an admin
// adding a known account directly.
import { col, query } from "../data/store";
import { audit, forbidden, memberId, notFound, requireRole, CAN_MANAGE_MEMBERS } from "./shared";
import { findByEmail } from "./users";

const INVITE_ROLES = ["member", "manager", "admin"];

interface Invite {
  id: string;
  orgId: string;
  email: string;
  role: string;
  status: string;
  invitedBy: string;
  createdAt: Date;
}

export async function create(orgId: string, actorId: string, email: string, role: string) {
  await requireRole(orgId, actorId, CAN_MANAGE_MEMBERS);
  const clean = (email || "").trim().toLowerCase();
  if (!clean) throw forbidden("Email required");

  const user = await findByEmail(clean);
  if (user && (await col("members").doc(memberId(orgId, user.id)).exists())) {
    throw forbidden("Already a member");
  }
  // Re-inviting reuses the outstanding invitation rather than stacking them.
  const prior = await query("invites")
    .where("orgId", "==", orgId)
    .where("email", "==", clean)
    .where("status", "==", "pending")
    .first<Omit<Invite, "id">>();
  if (prior) return prior;

  const chosen = INVITE_ROLES.includes(role) ? role : "member";
  // orgName is denormalised on purpose. An invitee is not a member yet, so
  // the rules will not let them read the org document; without this the
  // pending-invites list would have nothing to show but an id.
  const org = await col("orgs").doc(orgId).get<{ name: string }>();
  const doc = {
    orgId,
    orgName: org.data()?.name || "Organization",
    email: clean,
    role: chosen,
    status: "pending",
    invitedBy: actorId,
    createdAt: new Date(),
    respondedAt: null,
  };
  const id = await col("invites").add(doc);
  await audit(orgId, actorId, "invite.create", `${clean} as ${chosen}`);
  return { id, ...doc };
}

export async function listForOrg(orgId: string, actorId: string) {
  await requireRole(orgId, actorId, CAN_MANAGE_MEMBERS);
  return query("invites")
    .where("orgId", "==", orgId)
    .where("status", "==", "pending")
    .orderBy("createdAt", "desc")
    .get();
}

export async function revoke(orgId: string, actorId: string, inviteId: string) {
  await requireRole(orgId, actorId, CAN_MANAGE_MEMBERS);
  const snap = await col("invites").doc(inviteId).get<Omit<Invite, "id">>();
  const invite = snap.data();
  if (!snap.exists || !invite || invite.orgId !== orgId) throw notFound("Invite not found");
  await col("invites").doc(inviteId).update({ status: "revoked", respondedAt: new Date() });
  await audit(orgId, actorId, "invite.revoke", invite.email);
  return { success: true };
}

/** Pending invitations addressed to the signed-in user. */
export async function mine(email: string) {
  const invites = await query("invites")
    .where("email", "==", email.toLowerCase())
    .where("status", "==", "pending")
    .orderBy("createdAt", "desc")
    .get<Omit<Invite, "id">>();

  // The invitee is not a member yet, so the rules will not let them read the
  // org document. The invitation carries the name for display instead.
  return invites.map((i) => ({
    ...i,
    org: { id: i.orgId, name: (i as unknown as { orgName?: string }).orgName || "Organization" },
  }));
}

async function respond(userId: string, email: string, inviteId: string, accept: boolean) {
  const snap = await col("invites").doc(inviteId).get<Omit<Invite, "id">>();
  const invite = snap.data();
  if (!snap.exists || !invite || invite.status !== "pending") throw notFound("Invite not found");
  if (invite.email !== email.toLowerCase()) throw forbidden("This invitation is not for you");

  if (accept) {
    // Order matters. The membership rule authorises this write by reading the
    // invitation, so the invitation has to still say "pending" at that moment.
    // Flipping the status first would lock the user out of their own org.
    const ref = col("members").doc(memberId(invite.orgId, userId));
    if (!(await ref.exists())) {
      await ref.set({
        orgId: invite.orgId,
        userId,
        role: invite.role,
        inviteId, // the rules point-read this to verify the invitation
        tokenLimit: null,
        limitPeriod: "monthly",
        budgetLimit: null,
        teamId: null,
        createdAt: new Date(),
      });
    }
  }

  await col("invites").doc(inviteId).update({
    status: accept ? "accepted" : "declined",
    respondedAt: new Date(),
  });
  if (accept) await audit(invite.orgId, userId, "invite.accept", email);
  return { success: true, accepted: accept, orgId: invite.orgId };
}

export const accept = (userId: string, email: string, id: string) =>
  respond(userId, email, id, true);
export const decline = (userId: string, email: string, id: string) =>
  respond(userId, email, id, false);
