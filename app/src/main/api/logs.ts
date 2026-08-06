// Compliance interaction logging, for orgs that opt in.
//
// RETENTION, AND WHY IT LOOKS LIKE THIS
//
// The right mechanism is a Firestore TTL policy on `expiresAt`: declare it
// once and the database does the deleting. TTL requires a billing account,
// which is the one thing this project does not have, so it is out.
//
// The fallback is to sweep expired documents ourselves. That can only happen
// on an admin's machine, because firestore.rules only lets an admin delete a
// log, so the sweep runs when an admin opens the compliance view. Retention
// is therefore enforced on review rather than continuously: an expired entry
// may sit in the collection for a while, but it is deleted before anyone can
// read it, and it is never returned by list().
//
// Turning on billing and adding the TTL policy back is the upgrade path.
import { col, query, addStamped, deleteWhere, getMany, rest } from "../data/store";
import { audit, requireRole } from "./shared";
import { usersByIds } from "./users";

const MAX_FIELD = 8000; // keep stored prompts and responses bounded
const PRUNE_BATCH = 300;

export async function record(
  userId: string,
  data: { model?: string; prompt?: string; response?: string; flags?: string[] }
) {
  const members = await query("members").where("userId", "==", userId).get<{ orgId: string }>();
  if (!members.length) return { stored: 0 };

  const orgs = await getMany<{ loggingEnabled: boolean; retentionDays: number }>(
    "orgs",
    members.map((m) => m.orgId)
  );

  let stored = 0;
  for (const m of members) {
    const org = orgs.get(m.orgId);
    if (!org || !org.loggingEnabled) continue;
    const retentionDays = Number(org.retentionDays) || 30;
    await addStamped("interactionLogs", {
      orgId: m.orgId,
      userId,
      model: data.model || "unknown",
      prompt: (data.prompt || "").slice(0, MAX_FIELD),
      response: (data.response || "").slice(0, MAX_FIELD),
      flags: JSON.stringify(data.flags || []),
      expiresAt: new Date(Date.now() + retentionDays * 86400_000),
    });
    stored += 1;
  }
  return { stored };
}

/**
 * Compliance review: an org's logs, newest first (admins only).
 *
 * Firestore cannot match substrings, so a search term filters the most recent
 * page in memory rather than scanning history. For full-text search over a
 * long retention window, mirror to a search index.
 */
/**
 * Delete entries whose retention window has passed.
 *
 * Bounded to one batch per call so opening the logs view never turns into a
 * long delete loop; a backlog drains over successive visits.
 */
async function pruneExpired(orgId: string): Promise<number> {
  const stale = await query("interactionLogs")
    .where("orgId", "==", orgId)
    .where("expiresAt", "<", new Date())
    .limit(PRUNE_BATCH)
    .get();
  if (!stale.length) return 0;
  await rest.commit(
    stale.map((d) => ({ delete: rest.docPath("interactionLogs", d.id) }))
  );
  return stale.length;
}

export async function list(orgId: string, actorId: string, search?: string, limit = 100) {
  await requireRole(orgId, actorId, "admin");
  // Enforce retention before showing anything, so nothing past its window is
  // ever displayed even if the sweep has not caught up.
  await pruneExpired(orgId).catch(() => 0);
  const capped = Math.min(limit, 500);
  let logs = await query("interactionLogs")
    .where("orgId", "==", orgId)
    .orderBy("createdAt", "desc")
    .limit(search ? 500 : capped)
    .get<{ userId: string; prompt: string; response: string; expiresAt: Date }>();

  // Belt and braces: if a backlog outran one prune batch, still refuse to
  // show anything past its retention window.
  const now = Date.now();
  logs = logs.filter((l) => !l.expiresAt || new Date(l.expiresAt).getTime() > now);

  if (search) {
    const q = search.toLowerCase();
    logs = logs
      .filter((l) => l.prompt.toLowerCase().includes(q) || l.response.toLowerCase().includes(q))
      .slice(0, capped);
  }

  const users = await usersByIds(logs.map((l) => l.userId));
  return logs.map((l) => ({ ...l, email: users.get(l.userId)?.email || l.userId }));
}

export async function clear(orgId: string, actorId: string) {
  await requireRole(orgId, actorId, "admin");
  await deleteWhere("interactionLogs", "orgId", orgId);
  await audit(orgId, actorId, "logs.clear");
  return { success: true };
}

export { col };
