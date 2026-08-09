import { read as readSettings } from "../settings";
import { getClient, getDistinctId, isEnabled } from "./client";
import { filterEvent, type EventDraft } from "./policy";

export type CaptureSink = {
  capture(payload: {
    distinctId: string;
    event: string;
    properties: Record<string, unknown>;
  }): void;
};

export type CaptureDeps = {
  readSettings: () => Pick<AppSettings, "analyticsConsent" | "analytics">;
  hasKey: boolean;
  getDistinctId: () => string;
  sink: CaptureSink | null;
};

/** Testable capture path: policy gate + sink. Never throws. */
export function captureWith(draft: EventDraft, deps: CaptureDeps): void {
  try {
    if (!deps.sink) return;
    const settings = deps.readSettings();
    const filtered = filterEvent({
      draft,
      consent: settings.analyticsConsent,
      analytics: settings.analytics,
      hasKey: deps.hasKey,
    });
    if (!filtered) return;
    deps.sink.capture({
      distinctId: deps.getDistinctId(),
      event: filtered.event,
      properties: filtered.properties,
    });
  } catch {
    // never throw into callers
  }
}

export function capture(draft: EventDraft): void {
  const client = getClient();
  captureWith(draft, {
    readSettings: () => readSettings(),
    hasKey: isEnabled(),
    getDistinctId,
    sink: client
      ? {
          capture: (payload) => {
            client.capture({
              distinctId: payload.distinctId,
              event: payload.event,
              properties: payload.properties,
            });
          },
        }
      : null,
  });
}

export function trackAppOpened(): void {
  capture({ event: "app_opened", category: "productUsage" });
}

export function trackConsentSet(value: boolean): void {
  capture({
    event: "analytics_consent_set",
    category: "productUsage",
    properties: { value },
  });
}

export function trackFeatureUsed(feature: string): void {
  capture({
    event: "feature_used",
    category: "productUsage",
    properties: { feature },
  });
}

export function trackChatCreated(props: { title?: string }): void {
  capture({
    event: "chat_created",
    category: "chatEvents",
    properties: { ...props },
  });
}

export function trackMessage(props: {
  direction: "sent" | "received";
  role: string;
  model?: string;
  prompt_tokens?: number;
  completion_tokens?: number;
  text?: string;
  title?: string;
}): void {
  const { direction, text, ...rest } = props;
  const properties: Record<string, unknown> = { ...rest };
  if (text !== undefined) properties.text_preview = text;
  capture({
    event: direction === "sent" ? "message_sent" : "message_received",
    category: "chatEvents",
    properties,
  });
}

export function trackChatCompleted(props: {
  model?: string;
  duration_bucket?: string;
  prompt_tokens?: number;
  completion_tokens?: number;
}): void {
  capture({
    event: "chat_completed",
    category: "chatEvents",
    properties: { ...props },
  });
}

export function trackChatFailed(props: { error_code?: string }): void {
  capture({
    event: "chat_failed",
    category: "chatEvents",
    properties: { ...props },
  });
}

/** Coarse duration bucket for chat_completed — never emits exact ms. */
export function durationBucket(ms: number): string {
  if (ms < 5_000) return "0-5s";
  if (ms < 30_000) return "5-30s";
  if (ms < 120_000) return "30s-2m";
  return "2m+";
}
