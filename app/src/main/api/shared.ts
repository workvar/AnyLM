// Pieces every API service needs: identity of the caller, role checks,
// period windows, and the audit trail.
//
// These ran on Cloud Functions until the Blaze requirement made that
// impossible. The logic is the same; the difference is that role checks here
// are advisory (they produce good error messages) while the real enforcement
// is in firestore.rules, which the server cannot be talked out of.
import { col, query, addStamped, Row } from "../data/store";
import * as tokenStore from "../token-store";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const badRequest = (m: string) => new ApiError(400, m);
export const forbidden = (m: string) => new ApiError(403, m);
export const notFound = (m: string) => new ApiError(404, m);

/** The signed-in user's uid, read from the stored token. */
export function currentUserId(): string {
  const tokens = tokenStore.load();
  if (!tokens || !tokens.userId) throw new ApiError(401, "Not authenticated");
  return tokens.userId;
}

// --- roles -------------------------------------------------------------------

export const ROLES = ["member", "manager", "admin", "owner"] as const;
export type Role = (typeof ROLES)[number];

const RANK: Record<string, number> = { member: 0, manager: 1, admin: 2, owner: 3 };

export function atLeast(role: string, min: Role): boolean {
  return (RANK[role] ?? -1) >= RANK[min];
}

export function safeRole(role: string): string {
  return ["member", "manager", "admin"].includes(role) ? role : "member";
}

export const CAN_MANAGE_POLICIES: Role = "manager";
export const CAN_MANAGE_MEMBERS: Role = "admin";

export function memberId(orgId: string, userId: string): string {
  return `${orgId}__${userId}`;
}

export function connectorId(userId: string, provider: string): string {
  return `${userId}__${provider}`;
}

export interface Member {
  id: string;
  orgId: string;
  userId: string;
  role: string;
  tokenLimit: number | null;
  limitPeriod: string;
  budgetLimit: number | null;
  teamId: string | null;
  createdAt: Date;
}

export async function membership(orgId: string, userId: string): Promise<Member> {
  const snap = await col("members").doc(memberId(orgId, userId)).get<Omit<Member, "id">>();
  if (!snap.exists) throw forbidden("Not a member of this organization");
  return { id: snap.id, ...(snap.data() as Omit<Member, "id">) };
}

export async function requireRole(orgId: string, userId: string, min: Role): Promise<Member> {
  const m = await membership(orgId, userId);
  if (!atLeast(m.role, min)) throw forbidden("Insufficient role");
  return m;
}

export async function audit(
  orgId: string,
  actorId: string,
  action: string,
  detail?: string
): Promise<void> {
  // Never let an audit failure take down the operation it was describing.
  await addStamped("audit", {
    orgId,
    actorId,
    action,
    detail: detail || null,
  }).catch(() => undefined);
}

// --- periods ------------------------------------------------------------------

/**
 * Start of the current window for a limit period, in UTC.
 *
 * UTC rather than local time so every member of an org rolls over at the same
 * instant. When this ran on one shared backend the server's timezone was at
 * least consistent; now that it runs on each user's machine, local time would
 * mean colleagues in different countries got different windows.
 */
export function periodStart(period: string): Date | null {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = now.getUTCDate();
  switch (period) {
    case "daily":
      return new Date(Date.UTC(y, m, d));
    case "weekly": {
      const day = (now.getUTCDay() + 6) % 7; // week starts Monday
      return new Date(Date.UTC(y, m, d - day));
    }
    case "monthly":
      return new Date(Date.UTC(y, m, 1));
    case "lifetime":
    default:
      return null;
  }
}

// --- usage aggregation ---------------------------------------------------------

function windowed(q: ReturnType<typeof query>, period: string) {
  const start = periodStart(period);
  return start ? q.where("createdAt", ">=", start) : q;
}

export function sumTokens(userId: string, orgId: string | null, period: string): Promise<number> {
  let q = query("usage").where("userId", "==", userId);
  if (orgId) q = q.where("orgId", "==", orgId);
  return windowed(q, period).sum("totalTokens");
}

/**
 * Tokens consumed by a set of users inside one org. Firestore caps `in`
 * filters at 30 values, so larger teams are queried in chunks.
 */
export async function sumTokensForUsers(
  orgId: string,
  userIds: string[],
  period: string
): Promise<number> {
  if (!userIds.length) return 0;
  let total = 0;
  for (let i = 0; i < userIds.length; i += 30) {
    const q = query("usage")
      .where("orgId", "==", orgId)
      .where("userId", "in", userIds.slice(i, i + 30));
    total += await windowed(q, period).sum("totalTokens");
  }
  return total;
}

export function countSince(userId: string, since: Date): Promise<number> {
  return query("usage").where("userId", "==", userId).where("createdAt", ">=", since).count();
}

// --- misc ----------------------------------------------------------------------

export function parseJson(json: string): Record<string, unknown> {
  try {
    return (JSON.parse(json) as Record<string, unknown>) || {};
  } catch {
    return {};
  }
}

/** Dates become ISO strings on the way to the renderer, as Prisma once did. */
export function serialize<T>(value: T): T {
  if (value instanceof Date) return value.toISOString() as unknown as T;
  if (Array.isArray(value)) return value.map(serialize) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = serialize(v);
    return out as T;
  }
  return value;
}

export type { Row };
