// Third-party OAuth connectors for the skills layer.
//
// These used to run on the server, holding a confidential client secret. With
// no server, a connector can only be supported if its provider allows a
// PUBLIC client: one that authenticates with PKCE instead of a secret, since
// anything shipped in the binary is readable.
//
//   Outlook / Microsoft 365  supported. Microsoft identity platform supports
//                            true public clients; PKCE covers the exchange and
//                            offline_access still yields a refresh token.
//
//   Google Calendar          NOT supported without a server. Google requires
//                            client_secret at its token endpoint even for
//                            installed apps with PKCE, and it is required
//                            specifically to obtain a refresh token. Shipping
//                            it would put a credential in the bundle that the
//                            build guard in scripts/env-schema.js exists to
//                            prevent. It reappears the moment there is a
//                            server to hold the exchange.
import { shell } from "electron";
import { col, query } from "../data/store";
import { badRequest, connectorId, notFound } from "./shared";
import { env } from "../env";
import * as loopback from "../oauth/loopback";
import * as pkce from "../oauth/pkce";

const EXPIRY_SLACK = 60_000; // refresh this long before actual expiry

interface ProviderDef {
  id: string;
  label: string;
  authUrl: string;
  tokenUrl: string;
  scope: string;
  clientId: () => string;
  /** Empty when the provider works as a public client. */
  requiresServer?: string;
  extraAuthParams: Record<string, string>;
}

const PROVIDERS: Record<string, ProviderDef> = {
  outlook: {
    id: "outlook",
    label: "Outlook (Microsoft 365)",
    authUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    scope: "offline_access User.Read Calendars.ReadWrite Mail.Read Mail.Send",
    clientId: () => env.msClientId,
    extraAuthParams: {},
  },
  "google-calendar": {
    id: "google-calendar",
    label: "Google Calendar",
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scope:
      "https://www.googleapis.com/auth/calendar.events " +
      "https://www.googleapis.com/auth/calendar.readonly " +
      "https://www.googleapis.com/auth/userinfo.email",
    clientId: () => "",
    requiresServer:
      "Google requires a client secret to issue a refresh token, which cannot ship in a desktop app. This connector needs a server-side token exchange.",
    extraAuthParams: { access_type: "offline", prompt: "consent" },
  },
};

function providerOrThrow(id: string): ProviderDef {
  const p = PROVIDERS[id];
  if (!p) throw notFound(`Unknown connector provider "${id}"`);
  return p;
}

/** Which providers exist, whether they are usable, and whether connected. */
export async function status(userId: string) {
  const rows = await query("connectors")
    .where("userId", "==", userId)
    .get<{ provider: string; accountEmail: string | null }>();

  return Object.values(PROVIDERS).map((def) => {
    const row = rows.find((r) => r.provider === def.id);
    return {
      provider: def.id,
      label: def.label,
      configured: !def.requiresServer && !!def.clientId(),
      unavailableReason: def.requiresServer || (def.clientId() ? null : "Not configured in this build."),
      connected: !!row,
      accountEmail: row?.accountEmail ?? null,
    };
  });
}

async function exchange(
  def: ProviderDef,
  params: Record<string, string>
): Promise<{ access_token: string; refresh_token?: string; expires_in?: number; scope?: string }> {
  const res = await fetch(def.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: def.clientId(), scope: def.scope, ...params }),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, string>;
  if (!res.ok || !data.access_token) {
    throw badRequest(
      `Token exchange with ${def.label} failed: ${data.error_description || data.error || res.status}`
    );
  }
  return data as never;
}

/** Best effort: label the connection with the account it belongs to. */
async function accountEmailFor(providerId: string, accessToken: string): Promise<string | null> {
  try {
    const url =
      providerId === "outlook"
        ? "https://graph.microsoft.com/v1.0/me"
        : "https://www.googleapis.com/oauth2/v2/userinfo";
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    const data = (await res.json()) as Record<string, string>;
    return data.mail || data.userPrincipalName || data.email || null;
  } catch {
    return null;
  }
}

/**
 * Run the whole consent flow and store the result.
 *
 * This used to be split into `start` (returns a URL) and a server-side
 * `callback`. Without a server there is nothing to call back to, so the flow
 * completes here: open the browser, wait on a loopback port, redeem the code.
 * The OAuth `state` never leaves this process, so it needs no storage.
 */
export async function connect(userId: string, providerId: string) {
  const def = providerOrThrow(providerId);
  if (def.requiresServer) throw badRequest(def.requiresServer);
  if (!def.clientId()) throw badRequest(`${def.label} is not configured in this build.`);

  const challenge = pkce.create();
  const server = await loopback.listen("/connector");

  try {
    const url = new URL(def.authUrl);
    url.searchParams.set("client_id", def.clientId());
    url.searchParams.set("redirect_uri", server.redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", def.scope);
    url.searchParams.set("state", challenge.state);
    url.searchParams.set("code_challenge", challenge.challenge);
    url.searchParams.set("code_challenge_method", challenge.method);
    for (const [k, v] of Object.entries(def.extraAuthParams)) url.searchParams.set(k, v);
    await shell.openExternal(url.toString());

    const params = await server.received;
    if (params.state !== challenge.state) throw badRequest("OAuth state mismatch. Try again.");
    if (!params.code) throw badRequest("No authorization code was returned.");

    const tokens = await exchange(def, {
      grant_type: "authorization_code",
      code: params.code,
      redirect_uri: server.redirectUri,
      code_verifier: challenge.verifier,
    });
    const accountEmail = await accountEmailFor(providerId, tokens.access_token);

    await col("connectors").doc(connectorId(userId, providerId)).merge({
      userId,
      provider: providerId,
      accessToken: tokens.access_token,
      // Providers may omit the refresh token on re-consent; keep the old one.
      ...(tokens.refresh_token ? { refreshToken: tokens.refresh_token } : {}),
      expiresAt: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null,
      scope: tokens.scope ?? "",
      accountEmail,
      updatedAt: new Date(),
    });
    return { provider: providerId, accountEmail };
  } catch (e) {
    server.close();
    throw e;
  }
}

/** A live access token for skill execution, refreshed when stale. */
export async function freshToken(userId: string, providerId: string) {
  const def = providerOrThrow(providerId);
  const ref = col("connectors").doc(connectorId(userId, providerId));
  const row = (
    await ref.get<{
      accessToken: string;
      refreshToken?: string;
      expiresAt: Date | null;
    }>()
  ).data();
  if (!row) throw notFound(`${def.label} is not connected.`);

  const stale = row.expiresAt && new Date(row.expiresAt).getTime() - EXPIRY_SLACK < Date.now();
  if (!stale) return { accessToken: row.accessToken };
  if (!row.refreshToken) {
    throw badRequest(`${def.label} access expired and no refresh token is stored. Reconnect it.`);
  }

  const tokens = await exchange(def, {
    grant_type: "refresh_token",
    refresh_token: row.refreshToken,
  });
  await ref.update({
    accessToken: tokens.access_token,
    ...(tokens.refresh_token ? { refreshToken: tokens.refresh_token } : {}),
    expiresAt: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null,
    updatedAt: new Date(),
  });
  return { accessToken: tokens.access_token };
}

export async function disconnect(userId: string, providerId: string) {
  await col("connectors").doc(connectorId(userId, providerId)).delete().catch(() => undefined);
  return { success: true };
}
