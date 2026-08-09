import { app } from "electron";
import { read as readSettings } from "../settings";
import { captureEvent, getDistinctId, isEnabled } from "./client";
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
  baseProperties?: Record<string, unknown>;
};

function defaultBaseProperties(): Record<string, unknown> {
  try {
    return {
      app: "desktop",
      platform: process.platform,
      app_version: app.getVersion(),
    };
  } catch {
    return {
      app: "desktop",
      platform: process.platform,
    };
  }
}

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
    const properties = {
      ...deps.baseProperties,
      ...filtered.properties,
    };
    deps.sink.capture({
      distinctId: deps.getDistinctId(),
      event: filtered.event,
      properties,
    });
  } catch {
    // never throw into callers
  }
}

export function capture(draft: EventDraft): void {
  captureWith(draft, {
    readSettings: () => readSettings(),
    hasKey: isEnabled(),
    getDistinctId,
    baseProperties: defaultBaseProperties(),
    sink: isEnabled()
      ? {
          capture: (payload) => {
            captureEvent(payload.event, payload.properties);
          },
        }
      : null,
  });
}

export function trackAppOpened(): void {
  capture({ event: "app_opened", category: "productUsage" });
}

export function trackAppClosed(): void {
  capture({ event: "app_closed", category: "productUsage" });
}

export function trackConsentSet(value: boolean): void {
  capture({
    event: "analytics_consent_set",
    category: "productUsage",
    properties: { value },
  });
}

export function trackOnboardingCompleted(): void {
  capture({ event: "onboarding_completed", category: "productUsage" });
}

export function trackSetupWizardStep(step: string): void {
  capture({
    event: "setup_wizard_step",
    category: "productUsage",
    properties: { step },
  });
}

export function trackFeatureUsed(feature: string): void {
  capture({
    event: "feature_used",
    category: "productUsage",
    properties: { feature },
  });
}

export function trackFileOpened(props?: { source?: string; feature?: string }): void {
  capture({
    event: "file_opened",
    category: "productUsage",
    properties: { ...props },
  });
}

export function trackFileExported(props?: { source?: string; feature?: string }): void {
  capture({
    event: "file_exported",
    category: "productUsage",
    properties: { ...props },
  });
}

export function trackProjectCreated(props?: { title?: string; source?: string }): void {
  capture({
    event: "project_created",
    category: "productUsage",
    properties: { ...props },
  });
}

export function trackProjectOpened(props?: { title?: string; source?: string }): void {
  capture({
    event: "project_opened",
    category: "productUsage",
    properties: { ...props },
  });
}

export function trackProjectUpdated(props?: { title?: string }): void {
  capture({
    event: "project_updated",
    category: "productUsage",
    properties: { ...props },
  });
}

export function trackProjectDeleted(): void {
  capture({ event: "project_deleted", category: "productUsage" });
}

export function trackUserSignedUp(): void {
  capture({ event: "user_signed_up", category: "productUsage" });
}

export function trackUserLoggedIn(): void {
  capture({ event: "user_logged_in", category: "productUsage" });
}

export function trackUserLoggedOut(): void {
  capture({ event: "user_logged_out", category: "productUsage" });
}

export function trackAuthenticationFailed(props: { error_type?: string; operation?: string }): void {
  capture({
    event: "authentication_failed",
    category: "reliability",
    properties: { ...props },
  });
}

export function trackSettingsOpened(): void {
  capture({ event: "settings_opened", category: "productUsage" });
}

export function trackSettingsUpdated(props: { feature?: string }): void {
  capture({
    event: "settings_updated",
    category: "productUsage",
    properties: { ...props },
  });
}

export function trackOllamaSetupFailed(props: { error_type?: string }): void {
  capture({
    event: "ollama_setup_failed",
    category: "reliability",
    properties: { ...props },
  });
}

export function trackApiRequestFailed(props: {
  operation?: string;
  error_type?: string;
  http_status?: number;
  retryable?: boolean;
}): void {
  capture({
    event: "api_request_failed",
    category: "reliability",
    properties: { ...props },
  });
}

export function trackOllamaSetupCompleted(): void {
  capture({ event: "ollama_setup_completed", category: "reliability" });
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

export function trackAiRequestStarted(props?: { model?: string }): void {
  capture({
    event: "ai_request_started",
    category: "chatEvents",
    properties: { ...props },
  });
}

export function trackAiRequestCompleted(props: {
  model?: string;
  duration_bucket?: string;
  prompt_tokens?: number;
  completion_tokens?: number;
}): void {
  capture({
    event: "ai_request_completed",
    category: "chatEvents",
    properties: { ...props },
  });
}

export function trackAiRequestFailed(props: { error_type?: string; model?: string }): void {
  capture({
    event: "ai_request_failed",
    category: "chatEvents",
    properties: { ...props },
  });
}

/** Coarse duration bucket for ai_request_completed — never emits exact ms. */
export function durationBucket(ms: number): string {
  if (ms < 5_000) return "0-5s";
  if (ms < 30_000) return "5-30s";
  if (ms < 120_000) return "30s-2m";
  return "2m+";
}
