// Auth client: token storage, the OAuth flow, and the entry point to the API.
//
// The exported surface has not changed since this talked to NestJS, which is
// why ipc.ts, identity.ts, governance.ts, scheduler.ts and skills/exec.ts have
// never had to care that the backend was replaced twice. What changed:
//
//   NestJS          -> Firebase Auth + Cloud Functions
//   Cloud Functions -> Firebase Auth + Firestore, with the service logic
//                      running in this process, because Cloud Functions needs
//                      the Blaze plan (see firebase/README.md)
//
// `request()` no longer makes an HTTPS call. It dispatches into src/main/api,
// which reads and writes Firestore directly under the user's own ID token, so
// firestore.rules is what authorizes every operation.
import { shell } from "electron";
import * as idt from "./identity-toolkit";
import * as tokenStore from "./token-store";
import * as api from "./api";
import { SIGNIN_URL } from "./firebase-config";
import { useTokenProvider } from "./data/client";
import * as loopback from "./oauth/loopback";

// Refresh this long before the ID token actually expires, so a slow request
// never lands on a token that died in flight.
const REFRESH_SLACK_MS = 60_000;

const loadTokens = tokenStore.load;
const saveTokens = tokenStore.save;
const clearTokens = tokenStore.clear;

/** A valid ID token, refreshing first if it is expired or about to be. */
async function accessToken(): Promise<string> {
  const tokens = loadTokens();
  if (!tokens) throw new Error("Not authenticated");
  if (tokens.expiresAt && tokens.expiresAt - REFRESH_SLACK_MS > Date.now()) return tokens.idToken;
  return saveTokens(await idt.exchangeRefreshToken(tokens.refreshToken)).idToken;
}

// The Firestore transport asks for a token per request. Wiring it here rather
// than having data/client.ts import this module keeps the two free of a cycle.
useTokenProvider(accessToken);

/**
 * Call the API. Same signature it has always had; the difference is that the
 * work now happens in this process instead of over the network.
 */
async function request<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  if (!loadTokens()) throw new Error("Not authenticated");
  return api.request<T>(method, path, body);
}

/** Same as request(), but returns a raw string body (the usage CSV export). */
async function requestText(method: string, path: string): Promise<string> {
  if (!loadTokens()) throw new Error("Not authenticated");
  return api.requestText(method, path);
}

async function register(email: string, password: string, name: string): Promise<AuthUser> {
  const tokens = saveTokens(await idt.signUp(email, password));
  await idt.setDisplayName(tokens.idToken, name);
  // me() writes the user mirror, which invites and member lookups read.
  return me();
}

async function login(email: string, password: string): Promise<AuthUser> {
  saveTokens(await idt.signInWithPassword(email, password));
  return me();
}

async function refresh(): Promise<AuthUser> {
  const tokens = loadTokens();
  if (!tokens) throw new Error("Not authenticated");
  saveTokens(await idt.exchangeRefreshToken(tokens.refreshToken));
  return me();
}

async function me(): Promise<AuthUser> {
  return request<AuthUser>("GET", "/auth/me");
}

async function logout(): Promise<{ success: boolean }> {
  // Without a server there is nothing to revoke against: the refresh token
  // stays valid until it expires. Clearing local state is the whole of
  // sign-out, which is why token-store.ts encrypts it through the OS keystore.
  clearTokens();
  return { success: true };
}

/**
 * Sign in with Google or GitHub.
 *
 * The app opens a hosted page in the real system browser, which completes the
 * flow with the Firebase web SDK. Firebase's own OAuth handler holds the
 * provider client secrets inside the project, so nothing secret ships in this
 * binary and no Cloud Function is needed to mint anything.
 *
 * The result returns to a loopback port this process opened rather than to
 * the anylm:// scheme, because any application on the machine can claim a URL
 * scheme but only one can hold a port.
 */
async function oauth(provider: string): Promise<AuthUser> {
  const server = await loopback.listen("/callback");
  try {
    const url = new URL(SIGNIN_URL);
    url.searchParams.set("provider", provider);
    url.searchParams.set("port", new URL(server.redirectUri).port);
    await shell.openExternal(url.toString());

    const { refreshToken } = await server.received;
    if (!refreshToken) throw new Error("Sign-in did not return a session");
    saveTokens(await idt.exchangeRefreshToken(refreshToken));
    return me();
  } catch (e) {
    server.close();
    throw e;
  }
}

export {
  register,
  login,
  refresh,
  me,
  logout,
  oauth,
  request,
  requestText,
  loadTokens,
  clearTokens,
  accessToken,
};
