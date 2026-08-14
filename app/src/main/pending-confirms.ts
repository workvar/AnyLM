// Persisted risky-tool confirmations.
//
// A live confirm is a promise resolver in the agent loop (see ipc.ts) — it dies
// with the process. This store keeps the *intent* on disk instead, so a confirm
// the user never answered (app quit, or the in-session timeout elapsed) can be
// offered again the next time that conversation is opened.
import { app } from "electron";
import * as fs from "fs";
import * as path from "path";
import {
  expireAllPending,
  listForKey,
  normalizeRecord,
  prune,
  removeToken,
  setStatus,
  upsert,
} from "./pending-confirms-data";

function filePath(): string {
  return path.join(app.getPath("userData"), "llmeter-pending-confirms.json");
}

function readAll(): PendingConfirmRecord[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath(), "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(records: PendingConfirmRecord[]): void {
  try {
    fs.writeFileSync(filePath(), JSON.stringify(records, null, 2));
  } catch {
    // A confirm that cannot be persisted still works live; never break the turn.
  }
}

/** Store a confirm the moment it is asked. Returns the stored record. */
export function save(raw: unknown): PendingConfirmRecord | null {
  const record = normalizeRecord(raw, Date.now());
  if (!record) return null;
  writeAll(prune(upsert(readAll(), record), Date.now()));
  return record;
}

/** Forget a confirm the user actually answered (Allow or Deny). */
export function remove(token: string): void {
  if (!token) return;
  writeAll(removeToken(readAll(), String(token)));
}

/** Mark a confirm that timed out — still answerable, just not live any more. */
export function expire(token: string): void {
  if (!token) return;
  writeAll(setStatus(readAll(), String(token), "expired"));
}

/** Confirms to re-offer in a conversation. */
export function forKey(key: string): PendingConfirmRecord[] {
  if (!key) return [];
  return listForKey(readAll(), String(key));
}

export function get(token: string): PendingConfirmRecord | null {
  return readAll().find((r) => r.token === String(token)) || null;
}

/**
 * Called once at startup: anything still "pending" was owned by an agent loop
 * that no longer exists, so it becomes a re-offer instead of a ghost.
 */
export function reconcileOnStartup(): void {
  const now = Date.now();
  writeAll(prune(expireAllPending(readAll()), now));
}
