import { randomUUID } from "crypto";
import { app } from "electron";
import * as fs from "fs";
import * as path from "path";
import { env } from "../env";
import { read as readSettings } from "../settings";
import { buildMpBody, mpCollectUrl } from "./ga-payload";

const FLUSH_DELAY_MS = 2_000;

type QueuedEvent = {
  name: string;
  params: Record<string, unknown>;
  /** Set when a failed POST has already been re-queued once. */
  retryAttempt?: number;
};

let identifiedUid: string | null = null;
let cachedAnonymousId: string | null = null;
let eventQueue: QueuedEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushInFlight: Promise<void> | null = null;

/** True when GA4 measurement ID and API secret are both configured. */
export function isEnabled(): boolean {
  return Boolean(env.ga.measurementId && env.ga.apiSecret);
}

export function init(): void {
  // GA4 MP has no SDK session; queue is ready when enabled.
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

function scheduleFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flush();
  }, FLUSH_DELAY_MS);
}

async function sendBatch(batch: QueuedEvent[]): Promise<boolean> {
  try {
    const body = buildMpBody({
      clientId: getAnonymousDistinctId(),
      userId: identifiedUid,
      events: batch.map(({ name, params }) => ({ name, params })),
    });
    const url = mpCollectUrl(env.ga.measurementId, env.ga.apiSecret);
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return response.ok;
  } catch {
    return false;
  }
}

function requeueFailedBatch(batch: QueuedEvent[]): void {
  const retry = batch
    .filter((event) => !event.retryAttempt)
    .map((event) => ({ ...event, retryAttempt: 1 }));
  if (retry.length) eventQueue.unshift(...retry);
}

async function flush(): Promise<void> {
  if (flushInFlight) return flushInFlight;

  flushInFlight = (async () => {
    try {
      while (isEnabled() && eventQueue.length > 0) {
        const batch = eventQueue;
        eventQueue = [];
        const ok = await sendBatch(batch);
        if (!ok) {
          requeueFailedBatch(batch);
          break;
        }
      }
    } finally {
      flushInFlight = null;
    }
  })();

  return flushInFlight;
}

export function captureEvent(event: string, properties: Record<string, unknown>): void {
  try {
    if (!isEnabled()) return;
    eventQueue.push({ name: event, params: properties });
    scheduleFlush();
  } catch {
    // never throw into callers
  }
}

/** Identify with Firebase UID. No-op unless consent === true. */
export function identify(uid: string): void {
  try {
    if (!uid) return;
    if (identifiedUid === uid) return;
    if (readSettings().analyticsConsent !== true) return;
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
  try {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    await flush();
  } catch {
    // never throw into callers
  } finally {
    identifiedUid = null;
    eventQueue = [];
  }
}
