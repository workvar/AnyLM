// Auth client for the Firebase backend: token storage, API calls with
// refresh, and the desktop OAuth flow.
//
// The exported surface is unchanged from the NestJS version on purpose, so
// ipc.js, identity.js, governance.js, scheduler.js and skills/exec.js keep
// working untouched. What changed underneath:
//   - credentials are Firebase Auth's, not our own JWTs
//   - the API base is a fixed https origin, not a discovered localhost port
//   - there is no local server to start before signing in
import { shell } from "electron";
import * as idt from "./identity-toolkit";
import * as tokenStore from "./token-store";
import { API_URL, SIGNIN_URL } from "./firebase-config";
import { waitForTokens } from "./protocol";

const API = API_URL;

// Refresh this long before the ID token actually expires, so a slow request
// never lands on a token that died in flight.
const REFRESH_SLACK_MS = 60_000;

// Token persistence moved to token-store.ts, which encrypts through the OS
// keystore. These wrappers keep the names the rest of the app already imports.
const loadTokens = tokenStore.load;
const saveTokens = tokenStore.save;
const clearTokens = tokenStore.clear;

// A valid ID token, refreshing first if it is expired or about to be.
async function accessToken(): Promise<string> {
  const tokens = loadTokens();
  if (!tokens) throw new Error("Not authenticated");
  if (tokens.expiresAt && tokens.expiresAt - REFRESH_SLACK_MS > Date.now()) return tokens.idToken;
  const fresh = saveTokens(await idt.exchangeRefreshToken(tokens.refreshToken));
  return fresh.idToken;
}

// Force a refresh and return the new ID token. Used when the server rejects
// a token we believed was still valid, e.g. after a server-side revoke.
async function forceRefresh(): Promise<string> {
  const tokens = loadTokens();
  if (!tokens) throw new Error("Not authenticated");
  return saveTokens(await idt.exchangeRefreshToken(tokens.refreshToken)).idToken;
}

// Generic authenticated request with one forced-refresh retry. Used by the
// governance layer (orgs, policies, usage metering) and everything else.
async function request<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  const send = (token: string) =>
    fetch(`${API}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: body != null ? JSON.stringify(body) : undefined,
    });

  let res = await send(await accessToken());
  if (res.status === 401) res = await send(await forceRefresh());

  const data = ((await res.json().catch(() => ({}))) as any);
  if (!res.ok) throw new Error(data.message || `Request failed (${res.status})`);
  return data;
}

// Same as request(), but returns the raw response body (e.g. CSV exports).
async function requestText(method: string, path: string): Promise<string> {
  const send = (token: string) =>
    fetch(`${API}${path}`, { method, headers: { Authorization: `Bearer ${token}` } });

  let res = await send(await accessToken());
  if (res.status === 401) res = await send(await forceRefresh());
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.text();
}

async function register(email: string, password: string, name: string): Promise<AuthUser> {
  const tokens = saveTokens(await idt.signUp(email, password));
  await idt.setDisplayName(tokens.idToken, name);
  // /auth/me is where the server mirrors the account, enforces org SSO rules
  // and applies domain auto-join, so registration is not complete until it
  // succeeds.
  return me();
}

async function login(email: string, password: string): Promise<AuthUser> {
  saveTokens(await idt.signInWithPassword(email, password));
  return me();
}

async function refresh(): Promise<AuthUser> {
  await forceRefresh();
  return me();
}

async function me(): Promise<AuthUser> {
  return request<AuthUser>("GET", "/auth/me");
}

async function logout(): Promise<{ success: boolean }> {
  // Best effort: revoke refresh tokens server-side so a copied token file
  // cannot be replayed after signing out.
  await request("POST", "/auth/logout").catch(() => {});
  clearTokens();
  return { success: true };
}

// Open the hosted sign-in page in the system browser, then wait for the
// custom token to arrive over the anylm:// deep link and trade it for a
// session. Using the real browser is required by Google, which blocks
// sign-in inside embedded webviews, and by Firebase, whose popup flow needs
// a DOM that the Electron main process does not have.
async function oauth(provider: string): Promise<AuthUser> {
  const pending = waitForTokens();
  await shell.openExternal(`${SIGNIN_URL}?provider=${encodeURIComponent(provider)}`);
  const { customToken } = (await pending) as { customToken?: string };
  if (!customToken) throw new Error("Sign-in did not return a token");
  saveTokens(await idt.signInWithCustomToken(customToken));
  return me();
}

export { register, login, refresh, me, logout, oauth, request, requestText, loadTokens, clearTokens, API };

