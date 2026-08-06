// The `users` collection mirrors Firebase Auth so we can look a user up by
// email (invites, member adds) and put names next to usage rows, neither of
// which Auth alone supports.
//
// Gone from the Cloud Functions version: SSO enforcement and domain
// auto-join. Both needed to inspect orgs the caller is not yet a member of,
// which without a server would mean making every org's domain list readable
// by anyone signed in. Invitations cover onboarding instead.
import { col, query, getMany } from "../data/store";
import * as idt from "../identity-toolkit";
import * as tokenStore from "../token-store";
import { ApiError } from "./shared";

export interface PublicUser {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  provider: string;
  createdAt: string;
}

function providerOf(signInProvider: string): string {
  if (signInProvider === "google.com") return "google";
  if (signInProvider === "github.com") return "github";
  return "local";
}

/**
 * Refresh the mirror from Firebase Auth and return the public user.
 *
 * Called on every /auth/me, which is what the app does right after any
 * successful sign-in, so the mirror is never more than one sign-in stale.
 */
export async function me(): Promise<PublicUser> {
  const tokens = tokenStore.load();
  if (!tokens) throw new ApiError(401, "Not authenticated");

  const account = await idt.lookup(tokens.idToken);
  const userId = account.localId;
  const email = (account.email || "").toLowerCase();
  if (!email) throw new ApiError(401, "Account has no email address");

  const ref = col("users").doc(userId);
  const existing = await ref.get<Record<string, unknown>>();
  const prior = existing.data() || {};
  const provider = providerOf(account.providerUserInfo?.[0]?.providerId || "password");

  const data = {
    email,
    name: account.displayName ?? (prior.name as string) ?? null,
    avatarUrl: account.photoUrl ?? (prior.avatarUrl as string) ?? null,
    provider,
    updatedAt: new Date(),
    ...(existing.exists ? {} : { createdAt: new Date() }),
  };
  await ref.merge(data);

  const createdAt = (prior.createdAt as Date) || (data.createdAt as Date) || new Date();
  return {
    id: userId,
    email,
    name: data.name,
    avatarUrl: data.avatarUrl,
    provider,
    createdAt: createdAt.toISOString(),
  };
}

export async function findByEmail(email: string) {
  return query("users")
    .where("email", "==", (email || "").trim().toLowerCase())
    .first<{ email: string; name: string | null }>();
}

/** Bulk lookup for dashboards, one round trip per 100 ids. */
export async function usersByIds(
  userIds: string[]
): Promise<Map<string, { email: string; name: string | null }>> {
  const found = await getMany<{ email: string; name: string | null }>("users", userIds);
  const out = new Map<string, { email: string; name: string | null }>();
  for (const id of new Set(userIds)) {
    const u = found.get(id);
    out.set(id, { email: u?.email || id, name: u?.name ?? null });
  }
  return out;
}
