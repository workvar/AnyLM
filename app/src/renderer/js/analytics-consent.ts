// Soft-ask analytics consent modal (Accept / Decline / Configure…).
import { el } from "./dom.js";

export type AnalyticsConsentFlowDeps = {
  openPrivacy?: () => void;
};

export async function runAnalyticsConsentFlow(
  settings: AppSettings,
  deps: AnalyticsConsentFlowDeps = {},
): Promise<void> {
  if (settings.analyticsConsent !== null) return;
  if (!(await window.api.analyticsAvailable())) return;

  return new Promise((resolve) => {
    const overlay = el("analytics-consent");
    overlay.classList.remove("hidden");

    const finish = () => {
      overlay.classList.add("hidden");
      resolve();
    };

    el("analytics-consent-accept").onclick = async () => {
      await window.api.setSettings({ analyticsConsent: true });
      finish();
    };
    el("analytics-consent-decline").onclick = async () => {
      await window.api.setSettings({ analyticsConsent: false });
      finish();
    };
    el("analytics-consent-configure").onclick = () => {
      if (deps.openPrivacy) deps.openPrivacy();
      else {
        void import("./settings-hub.js").then(({ openSettingsHub }) => {
          openSettingsHub("privacy");
        });
      }
      finish();
    };
  });
}
