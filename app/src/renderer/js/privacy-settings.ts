// Privacy settings panel: analytics consent master + field-group toggles.
import { el } from "./dom.js";
import { syncClarity } from "./clarity.js";

type AnalyticsBoolKey = Exclude<keyof AnalyticsSettings, "truncateChars">;

const FIELD_TOGGLES: { id: string; key: AnalyticsBoolKey }[] = [
  { id: "analytics-product-usage", key: "productUsage" },
  { id: "analytics-reliability", key: "reliability" },
  { id: "analytics-chat-events", key: "chatEvents" },
  { id: "analytics-titles", key: "titles" },
  { id: "analytics-model-and-tokens", key: "modelAndTokens" },
  { id: "analytics-truncated-message-text", key: "truncatedMessageText" },
];

let settings: AppSettings | null = null;

async function loadSettings(): Promise<AppSettings> {
  if (!settings) settings = await window.api.getSettings();
  return settings;
}

async function save(patch: Partial<AppSettings>): Promise<AppSettings> {
  settings = await window.api.setSettings(patch);
  return settings;
}

function paintTruncateRow(analytics: AnalyticsSettings) {
  const row = el("analytics-truncate-chars-row");
  if (row) row.classList.toggle("hidden", !analytics.truncatedMessageText);
  const input = el("analytics-truncate-chars");
  if (input) input.value = String(analytics.truncateChars ?? 200);
}

function paintMaster(consent: boolean | null) {
  const master = el("analytics-master");
  if (master) master.checked = consent === true;
  const hint = el("analytics-master-hint");
  if (hint) hint.classList.toggle("hidden", consent !== null);
}

function paintFields(analytics: AnalyticsSettings) {
  for (const { id, key } of FIELD_TOGGLES) {
    const node = el(id);
    if (node) node.checked = analytics[key] === true;
  }
  paintTruncateRow(analytics);
}

/** Re-paint Privacy panel from current settings. */
export async function paintPrivacySettings() {
  settings = await window.api.getSettings();
  paintMaster(settings.analyticsConsent);
  paintFields(settings.analytics);
}

export function initPrivacySettings() {
  el("analytics-master").onchange = async (e) => {
    const checked = (e.target as UiElement).checked;
    const next = await save({ analyticsConsent: checked });
    paintMaster(next.analyticsConsent);
    await syncClarity();
  };

  for (const { id, key } of FIELD_TOGGLES) {
    el(id).onchange = async (e) => {
      const checked = (e.target as UiElement).checked;
      const current = await loadSettings();
      const next = await save({
        analytics: { ...current.analytics, [key]: checked },
      });
      paintFields(next.analytics);
    };
  }

  el("analytics-truncate-chars").onchange = async (e) => {
    const n = Number((e.target as UiElement).value);
    const current = await loadSettings();
    const next = await save({
      analytics: { ...current.analytics, truncateChars: n },
    });
    paintTruncateRow(next.analytics);
  };
}
