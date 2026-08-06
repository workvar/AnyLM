// Governance for API-key callers hitting the local /v1 endpoint.
//
// This used to forward the caller's key to a Cloud Function, which resolved it
// to a user server-side. With no server, Firestore is reached under the
// signed-in user's own ID token, so the key must be proven to belong to THAT
// user before anything runs. Otherwise a stray key would borrow whoever is
// signed in on this machine.
//
// That restriction is not really a loss. The endpoint exists so your other
// local tools can route through your own AnyLM, against your own Ollama. A key
// belonging to someone else has no business being honoured here.
import * as apikeys from "../api/apikeys";
import * as policies from "../api/policies";
import * as usage from "../api/usage";
import * as logs from "../api/logs";
import { check } from "../api/usage-check";
import * as tokenStore from "../token-store";

export class ProxyAuthError extends Error {
  status = 401;
}

/**
 * Resolve an `anylm_` key and confirm it belongs to the signed-in user.
 *
 * The lookup itself is a Firestore read of a document whose id is the sha256
 * of the key, so an invalid key cannot even be read.
 */
export async function authenticate(bearer: string): Promise<string> {
  const session = tokenStore.load();
  if (!session || !session.userId) {
    throw new ProxyAuthError("No user is signed in to AnyLM on this machine.");
  }
  let ownerId: string;
  try {
    ownerId = await apikeys.authenticate(bearer);
  } catch {
    throw new ProxyAuthError("Invalid API key.");
  }
  if (ownerId !== session.userId) {
    throw new ProxyAuthError("This API key belongs to a different AnyLM account.");
  }
  return ownerId;
}

/** Policies that apply to the key's owner. */
export function effectivePolicies(userId: string) {
  return policies.effective(userId);
}

export function preflight(userId: string, model: string, promptTokens: number) {
  return check(userId, model, promptTokens);
}

export function report(
  userId: string,
  model: string,
  promptTokens: number,
  completionTokens: number
) {
  return usage.report(userId, { model, promptTokens, completionTokens });
}

export function log(
  userId: string,
  entry: { model: string; prompt: string; response: string; flags: string[] }
) {
  return logs.record(userId, entry);
}
