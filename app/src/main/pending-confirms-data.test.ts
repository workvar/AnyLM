import { expect, test } from "bun:test";
import {
  expireAllPending,
  listForKey,
  normalizeRecord,
  prune,
  removeToken,
  setStatus,
  upsert,
} from "./pending-confirms-data";

const NOW = 1_700_000_000_000;

function rec(over: Partial<PendingConfirmRecord> = {}): PendingConfirmRecord {
  return {
    token: "t1",
    key: "chat:c1",
    chatId: "c1",
    projectId: null,
    threadId: null,
    toolName: "generate_document",
    toolDescription: "",
    args: { title: "Guide", format: "docx" },
    createdAt: NOW,
    status: "pending",
    ...over,
  };
}

test("normalizeRecord keeps the fields needed to replay a call", () => {
  const r = normalizeRecord(
    { token: "t", key: "thread:x", threadId: "x", projectId: "p", toolName: "generate_document", args: { a: 1 } },
    NOW
  );
  expect(r?.token).toBe("t");
  expect(r?.threadId).toBe("x");
  expect(r?.args).toEqual({ a: 1 });
  expect(r?.status).toBe("pending");
  expect(r?.createdAt).toBe(NOW);
});

test("normalizeRecord rejects records missing token, key or tool", () => {
  expect(normalizeRecord({ key: "chat:c", toolName: "x" }, NOW)).toBeNull();
  expect(normalizeRecord({ token: "t", toolName: "x" }, NOW)).toBeNull();
  expect(normalizeRecord({ token: "t", key: "chat:c" }, NOW)).toBeNull();
  expect(normalizeRecord(null, NOW)).toBeNull();
});

test("upsert replaces by token rather than duplicating", () => {
  const one = upsert([], rec());
  const two = upsert(one, rec({ args: { title: "New" } }));
  expect(two).toHaveLength(1);
  expect(two[0].args).toEqual({ title: "New" });
});

test("removeToken drops only the matching record", () => {
  const list = [rec(), rec({ token: "t2" })];
  expect(removeToken(list, "t1").map((r) => r.token)).toEqual(["t2"]);
});

test("setStatus marks a timed-out confirm as re-offerable", () => {
  expect(setStatus([rec()], "t1", "expired")[0].status).toBe("expired");
});

test("expireAllPending converts orphans left by a crash or quit", () => {
  const list = [rec(), rec({ token: "t2", status: "expired" })];
  expect(expireAllPending(list).every((r) => r.status === "expired")).toBe(true);
});

test("prune drops records older than a week", () => {
  const old = rec({ token: "old", createdAt: NOW - 8 * 24 * 60 * 60 * 1000 });
  const kept = rec({ token: "new", createdAt: NOW - 60_000 });
  expect(prune([old, kept], NOW).map((r) => r.token)).toEqual(["new"]);
});

test("listForKey returns only expired records for that conversation, oldest first", () => {
  const list = [
    rec({ token: "b", status: "expired", createdAt: NOW + 10 }),
    rec({ token: "a", status: "expired", createdAt: NOW }),
    rec({ token: "live" }),
    rec({ token: "other", key: "chat:zzz", status: "expired" }),
  ];
  expect(listForKey(list, "chat:c1").map((r) => r.token)).toEqual(["a", "b"]);
});
