import { randomUUID } from "crypto";
import { app } from "electron";
import * as fs from "fs";
import * as path from "path";
import { PostHog } from "posthog-node";
import { env } from "../env";
import { read as readSettings } from "../settings";

let client: PostHog | null = null;
let identifiedUid: string | null = null;
let cachedAnonymousId: string | null = null;

/** True when a PostHog project key is baked/configured. */
export function isEnabled(): boolean {
  return Boolean(env.posthog.key);
}

export function getClient(): PostHog | null {
  return client;
}

export function init(): void {
  if (client || !env.posthog.key) return;
  try {
    client = new PostHog(env.posthog.key, {
      host: env.posthog.host,
    });
  } catch {
    client = null;
  }
}

function anonymousIdPath(): string {
  return path.join(app.getPath("userData"), "analytics-distinct-id");
}

/** Stable anonymous distinct id persisted under Electron userData. */
export function getAnonymousDistinctId(): string {
  if (cachedAnonymousId) return cachedAnonymousId;
  try {
    const filePath = anonymousIdPath();
    if (fs.existsSync(filePath)) {
      const existing = fs.readFileSync(filePath, "utf8").trim();
      if (existing) {
        cachedAnonymousId = existing;
        return existing;
      }
    }
    const id = randomUUID();
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, id, "utf8");
    cachedAnonymousId = id;
    return id;
  } catch {
    cachedAnonymousId = cachedAnonymousId ?? randomUUID();
    return cachedAnonymousId;
  }
}

/** Identified Firebase UID when set; otherwise the anonymous id. */
export function getDistinctId(): string {
  return identifiedUid ?? getAnonymousDistinctId();
}

/** Identify with Firebase UID. No-op unless consent === true and client exists. */
export function identify(uid: string): void {
  try {
    if (!client || !uid) return;
    if (identifiedUid === uid) return;
    if (readSettings().analyticsConsent !== true) return;

    const anon = getAnonymousDistinctId();
    if (anon && anon !== uid) {
      client.alias({ distinctId: uid, alias: anon });
    }
    client.identify({ distinctId: uid });
    identifiedUid = uid;
  } catch {
    // never throw into callers
  }
}

/** Clear local identified identity (e.g. on logout). */
export function reset(): void {
  try {
    identifiedUid = null;
  } catch {
    // never throw into callers
  }
}

export async function shutdown(): Promise<void> {
  const current = client;
  client = null;
  identifiedUid = null;
  if (!current) return;
  try {
    await current.shutdown();
  } catch {
    // never throw into callers
  }
}
