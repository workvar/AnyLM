// GitHub OAuth via the Device Authorization Grant.
//
// AnyLM has no server to hold a client secret (see anylm-firebase-migration
// memory / firebase/README.md), and unlike Google, GitHub's classic OAuth
// token exchange requires one — it doesn't support PKCE. The device flow
// sidesteps that entirely: no client secret, no redirect URI, nothing to
// intercept. The user is shown a short code, opens github.com/login/device
// in their normal browser, and this process polls until they approve it.
// This is the same shape as api/connectors.ts's PKCE flow one layer over:
// a token lands in the `connectors` collection either way.
import { shell } from "electron";
import { col } from "../data/store";
import { badRequest } from "../api/shared";
import { connectorId } from "../api/shared";
import { env } from "../env";

const PROVIDER = "github";
// Enough to read/write issues and PRs, and to read+write Projects v2 boards.
const SCOPE = "repo read:org project";

interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

export interface DeviceStart {
  userCode: string;
  verificationUri: string;
  deviceCode: string;
  expiresIn: number;
  interval: number;
}

/** Kick off the flow: get a user code, open the verification page. */
export async function startDeviceFlow(): Promise<DeviceStart> {
  if (!env.githubClientId) {
    throw badRequest("GitHub isn't configured in this build (missing client id).");
  }
  const res = await fetch("https://github.com/login/device/code", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: env.githubClientId, scope: SCOPE }),
  });
  const data = (await res.json()) as DeviceCodeResponse;
  if (!res.ok || !data.device_code) {
    throw badRequest(`Could not start GitHub sign-in (${res.status}).`);
  }
  await shell.openExternal(data.verification_uri);
  return {
    userCode: data.user_code,
    verificationUri: data.verification_uri,
    deviceCode: data.device_code,
    expiresIn: data.expires_in,
    interval: data.interval,
  };
}

interface TokenResponse {
  access_token?: string;
  token_type?: string;
  scope?: string;
  error?: "authorization_pending" | "slow_down" | "expired_token" | "access_denied" | string;
  interval?: number; // present on slow_down
}

/**
 * Poll until the user approves (or the code expires). Runs entirely inside
 * this one IPC call — the renderer just awaits it after showing the code.
 */
export async function waitForApproval(userId: string, start: DeviceStart): Promise<{ login: string }> {
  let interval = start.interval;
  const deadline = Date.now() + start.expiresIn * 1000;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, interval * 1000));

    const res = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: env.githubClientId,
        device_code: start.deviceCode,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      }),
    });
    const data = (await res.json()) as TokenResponse;

    if (data.access_token) {
      const login = await accountLogin(data.access_token);
      await col("connectors").doc(connectorId(userId, PROVIDER)).merge({
        userId,
        provider: PROVIDER,
        accessToken: data.access_token,
        // Classic OAuth Apps: this token doesn't expire and there's no
        // refresh token to store. GitHub Apps installed later would add one.
        scope: data.scope ?? SCOPE,
        accountLogin: login,
        updatedAt: new Date(),
      });
      return { login };
    }

    if (data.error === "slow_down" && data.interval) interval = data.interval;
    else if (data.error === "authorization_pending") continue;
    else throw badRequest(`GitHub sign-in ${data.error === "access_denied" ? "was declined" : "failed"}.`);
  }
  throw badRequest("GitHub sign-in code expired. Try again.");
}

async function accountLogin(accessToken: string): Promise<string> {
  const res = await fetch("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/vnd.github+json" },
  });
  const data = (await res.json()) as { login?: string };
  return data.login || "unknown";
}

export async function connectedAccount(userId: string): Promise<{ login: string } | null> {
  const row = (await col("connectors").doc(connectorId(userId, PROVIDER)).get<{ accountLogin: string }>()).data();
  return row ? { login: row.accountLogin } : null;
}

export async function disconnect(userId: string): Promise<void> {
  await col("connectors").doc(connectorId(userId, PROVIDER)).delete().catch(() => undefined);
}

export async function tokenFor(userId: string): Promise<string> {
  const row = (await col("connectors").doc(connectorId(userId, PROVIDER)).get<{ accessToken: string }>()).data();
  if (!row) throw badRequest("GitHub isn't connected.");
  return row.accessToken;
}
