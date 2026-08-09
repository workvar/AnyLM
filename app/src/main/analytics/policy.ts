export type AnalyticsCategory = "productUsage" | "reliability" | "chatEvents";

export type EventDraft = {
  event: string;
  category: AnalyticsCategory;
  properties?: Record<string, unknown>;
};

export type FilterInput = {
  draft: EventDraft;
  consent: boolean | null;
  analytics: AnalyticsSettings;
  hasKey: boolean;
};

const DANGEROUS_KEYS = [
  "email",
  "path",
  "file_path",
  "tool_args",
  "tool_output",
  "content",
  "messages",
] as const;

const TITLE_KEYS = ["title", "project_title"] as const;
const MODEL_KEYS = ["model", "prompt_tokens", "completion_tokens"] as const;

/** Returns null to drop; otherwise sanitized properties (may be {}). */
export function filterEvent(
  input: FilterInput,
): { event: string; properties: Record<string, unknown> } | null {
  const { draft, consent, analytics, hasKey } = input;

  if (!hasKey || consent === false) return null;
  if (analytics[draft.category] === false) return null;

  const properties: Record<string, unknown> = { ...draft.properties };

  for (const key of DANGEROUS_KEYS) {
    delete properties[key];
  }

  if (!analytics.titles) {
    for (const key of TITLE_KEYS) {
      delete properties[key];
    }
  }

  if (!analytics.modelAndTokens) {
    for (const key of MODEL_KEYS) {
      delete properties[key];
    }
  }

  if (!analytics.truncatedMessageText) {
    delete properties.text_preview;
  } else if ("text_preview" in properties) {
    properties.text_preview = String(properties.text_preview).slice(0, analytics.truncateChars);
  }

  if (draft.event === "ai_request_failed" && !analytics.reliability) {
    delete properties.error_type;
  }

  return { event: draft.event, properties };
}
