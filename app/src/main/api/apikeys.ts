// API keys for the local OpenAI-compatible proxy.
//
// The document id is the sha256 of the secret. That gives a point-read lookup
// with no query, and it means the rules can be written as "you may read this
// document if you already know the key", which is exactly the property an API
// key should have. The plaintext is returned once, at creation, and never
// stored.
import { createHash, randomBytes } from "crypto";
import { col, query } from "../data/store";
import { notFound } from "./shared";

export function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export async function create(userId: string, name: string) {
  const secret = `anylm_${randomBytes(24).toString("hex")}`;
  const prefix = secret.slice(0, 12);
  const id = hashKey(secret);
  const label = name || "Unnamed key";

  await col("apiKeys").doc(id).set({
    userId,
    name: label,
    prefix,
    revoked: false,
    createdAt: new Date(),
    lastUsedAt: null,
  });
  return { id, name: label, prefix, key: secret };
}

export async function list(userId: string) {
  return query("apiKeys")
    .where("userId", "==", userId)
    .orderBy("createdAt", "desc")
    .get<{
      name: string;
      prefix: string;
      revoked: boolean;
      createdAt: Date;
      lastUsedAt: Date | null;
    }>();
}

export async function revoke(userId: string, keyId: string) {
  const snap = await col("apiKeys").doc(keyId).get<{ userId: string }>();
  if (!snap.exists || snap.data()?.userId !== userId) throw notFound("Key not found");
  await col("apiKeys").doc(keyId).update({ revoked: true });
  return { success: true };
}

/**
 * Resolve a bearer key to the user it belongs to, for the local proxy.
 *
 * Reading the document requires knowing the secret, because the id is its
 * hash. A caller who guesses wrong gets a 404 from the rules, not a hint.
 */
export async function authenticate(bearer: string): Promise<string> {
  const key = (bearer || "").replace(/^Bearer\s+/i, "").trim();
  if (!key.startsWith("anylm_")) throw notFound("Invalid API key");
  const ref = col("apiKeys").doc(hashKey(key));
  const snap = await ref.get<{ userId: string; revoked: boolean }>();
  const data = snap.data();
  if (!snap.exists || !data || data.revoked) throw notFound("Invalid API key");
  ref.update({ lastUsedAt: new Date() }).catch(() => undefined);
  return data.userId;
}
