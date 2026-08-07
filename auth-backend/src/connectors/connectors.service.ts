import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomBytes } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { PROVIDERS, providerOrThrow } from "./providers";

// Refresh access tokens this many ms before they actually expire.
const EXPIRY_SLACK = 60_000;
const STATE_TTL = 10 * 60_000;

interface PendingState {
  userId: string;
  provider: string;
  expires: number;
}

@Injectable()
export class ConnectorsService {
  // OAuth `state` → who started the flow. In-memory is fine: states are
  // short-lived and a lost state just means redoing the connect click.
  private pending = new Map<string, PendingState>();

  constructor(private prisma: PrismaService, private config: ConfigService) {}

  private callbackUrl(provider: string) {
    return `http://127.0.0.1:${process.env.PORT}/connectors/${provider}/callback`;
  }

  private creds(providerId: string) {
    const def = providerOrThrow(providerId);
    const clientId = this.config.get<string>(def.clientIdEnv, "");
    const clientSecret = this.config.get<string>(def.clientSecretEnv, "");
    if (!clientId || !clientSecret) {
      throw new BadRequestException(
        `${def.label} is not configured on this server (missing ${def.clientIdEnv}/${def.clientSecretEnv}).`
      );
    }
    return { def, clientId, clientSecret };
  }

  // Which providers exist, whether they're configured, and whether this
  // user has connected them.
  async status(userId: string) {
    const rows = await this.prisma.connectorToken.findMany({ where: { userId } });
    return Object.values(PROVIDERS).map((def) => {
      const row = rows.find((r) => r.provider === def.id);
      return {
        provider: def.id,
        label: def.label,
        configured:
          !!this.config.get(def.clientIdEnv) && !!this.config.get(def.clientSecretEnv),
        connected: !!row,
        accountEmail: row?.accountEmail ?? null,
      };
    });
  }

  // Build the consent URL for the browser. The random state ties the
  // callback back to this user.
  start(userId: string, providerId: string) {
    const { def, clientId } = this.creds(providerId);
    const state = randomBytes(24).toString("hex");
    this.pending.set(state, { userId, provider: def.id, expires: Date.now() + STATE_TTL });
    this.gcStates();

    const url = new URL(def.authUrl);
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", this.callbackUrl(def.id));
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", def.scope);
    url.searchParams.set("state", state);
    for (const [k, v] of Object.entries(def.extraAuthParams)) url.searchParams.set(k, v);
    return { url: url.toString() };
  }

  // Exchange the authorization code and persist tokens.
  async handleCallback(providerId: string, code: string, state: string) {
    const pending = this.pending.get(state);
    if (!pending || pending.provider !== providerId || pending.expires < Date.now()) {
      throw new BadRequestException("Invalid or expired OAuth state. Try connecting again.");
    }
    this.pending.delete(state);

    const tokens = await this.exchange(providerId, {
      grant_type: "authorization_code",
      code,
      redirect_uri: this.callbackUrl(providerId),
    });
    const accountEmail = await this.fetchAccountEmail(providerId, tokens.access_token);

    await this.prisma.connectorToken.upsert({
      where: { userId_provider: { userId: pending.userId, provider: providerId } },
      create: {
        userId: pending.userId,
        provider: providerId,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? null,
        expiresAt: this.expiryDate(tokens.expires_in),
        scope: tokens.scope ?? "",
        accountEmail,
      },
      update: {
        accessToken: tokens.access_token,
        // Providers may omit the refresh token on re-consent; keep the old one.
        ...(tokens.refresh_token ? { refreshToken: tokens.refresh_token } : {}),
        expiresAt: this.expiryDate(tokens.expires_in),
        scope: tokens.scope ?? "",
        accountEmail,
      },
    });
    return { provider: providerId };
  }

  // Hand the app a live access token, refreshing first when near expiry.
  async freshToken(userId: string, providerId: string) {
    const row = await this.prisma.connectorToken.findUnique({
      where: { userId_provider: { userId, provider: providerId } },
    });
    if (!row) throw new NotFoundException(`${providerId} is not connected.`);

    const stale = row.expiresAt && row.expiresAt.getTime() - EXPIRY_SLACK < Date.now();
    if (!stale) return { accessToken: row.accessToken };
    if (!row.refreshToken) {
      throw new BadRequestException(
        `${providerId} token expired and no refresh token is stored. Reconnect the skill.`
      );
    }

    const tokens = await this.exchange(providerId, {
      grant_type: "refresh_token",
      refresh_token: row.refreshToken,
    });
    const updated = await this.prisma.connectorToken.update({
      where: { userId_provider: { userId, provider: providerId } },
      data: {
        accessToken: tokens.access_token,
        ...(tokens.refresh_token ? { refreshToken: tokens.refresh_token } : {}),
        expiresAt: this.expiryDate(tokens.expires_in),
      },
    });
    return { accessToken: updated.accessToken };
  }

  async disconnect(userId: string, providerId: string) {
    await this.prisma.connectorToken
      .delete({ where: { userId_provider: { userId, provider: providerId } } })
      .catch(() => undefined);
    return { success: true };
  }

  // ---------- helpers ----------

  private async exchange(providerId: string, params: Record<string, string>) {
    const { def, clientId, clientSecret } = this.creds(providerId);
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: def.scope,
      ...params,
    });
    const res = await fetch(def.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok || !data.access_token) {
      throw new BadRequestException(
        `Token exchange with ${def.label} failed: ${data.error_description || data.error || res.status}`
      );
    }
    return data as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
    };
  }

  private expiryDate(expiresIn?: number) {
    return expiresIn ? new Date(Date.now() + expiresIn * 1000) : null;
  }

  // Best-effort: label the connection with the account it belongs to.
  private async fetchAccountEmail(providerId: string, accessToken: string) {
    try {
      const url =
        providerId === "outlook"
          ? "https://graph.microsoft.com/v1.0/me"
          : "https://www.googleapis.com/oauth2/v2/userinfo";
      const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      const data: any = await res.json();
      return data.mail || data.userPrincipalName || data.email || null;
    } catch {
      return null;
    }
  }

  private gcStates() {
    const now = Date.now();
    for (const [k, v] of this.pending) if (v.expires < now) this.pending.delete(k);
  }
}
