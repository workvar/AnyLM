// Pure data helpers for persisted tool confirmations.
// Kept separate from the fs/electron wrapper so the rules are unit-testable.

const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // records older than a week are dropped

/** Normalise an untrusted record from the renderer; null when unusable. */
export function normalizeRecord(
  raw: unknown,
  now: number
): PendingConfirmRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const token = String(r.token || "").trim();
  const key = String(r.key || "").trim();
  const toolName = String(r.toolName || "").trim();
  if (!token || !key || !toolName) return null;
  return {
    token,
    key,
    chatId: r.chatId ? String(r.chatId) : null,
    projectId: r.projectId ? String(r.projectId) : null,
    threadId: r.threadId ? String(r.threadId) : null,
    toolName,
    toolDescription: r.toolDescription ? String(r.toolDescription) : "",
    args: r.args && typeof r.args === "object" ? (r.args as Record<string, unknown>) : {},
    createdAt: typeof r.createdAt === "number" ? r.createdAt : now,
    status: r.status === "expired" ? "expired" : "pending",
  };
}

/** Insert or replace by token. */
export function upsert(
  records: PendingConfirmRecord[],
  record: PendingConfirmRecord
): PendingConfirmRecord[] {
  return [...records.filter((r) => r.token !== record.token), record];
}

export function removeToken(
  records: PendingConfirmRecord[],
  token: string
): PendingConfirmRecord[] {
  return records.filter((r) => r.token !== token);
}

export function setStatus(
  records: PendingConfirmRecord[],
  token: string,
  status: PendingConfirmRecord["status"]
): PendingConfirmRecord[] {
  return records.map((r) => (r.token === token ? { ...r, status } : r));
}

/**
 * A record still marked "pending" at startup belonged to an agent loop that
 * died with the process — it can never be resolved live, so it becomes an
 * offer the user can take up again.
 */
export function expireAllPending(records: PendingConfirmRecord[]): PendingConfirmRecord[] {
  return records.map((r) => (r.status === "pending" ? { ...r, status: "expired" } : r));
}

export function prune(records: PendingConfirmRecord[], now: number): PendingConfirmRecord[] {
  return records.filter((r) => now - r.createdAt < MAX_AGE_MS);
}

/** Records a conversation should re-offer when it is opened. */
export function listForKey(
  records: PendingConfirmRecord[],
  key: string
): PendingConfirmRecord[] {
  return records
    .filter((r) => r.key === key && r.status === "expired")
    .sort((a, b) => a.createdAt - b.createdAt);
}
