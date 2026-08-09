export {
  init,
  shutdown,
  identify,
  reset,
  isEnabled,
  getDistinctId,
  getAnonymousDistinctId,
  captureEvent,
} from "./client";

export {
  capture,
  captureWith,
  trackAppOpened,
  trackAppClosed,
  trackConsentSet,
  trackOnboardingCompleted,
  trackSetupWizardStep,
  trackFeatureUsed,
  trackFileOpened,
  trackFileExported,
  trackProjectCreated,
  trackProjectOpened,
  trackProjectUpdated,
  trackProjectDeleted,
  trackUserSignedUp,
  trackUserLoggedIn,
  trackUserLoggedOut,
  trackAuthenticationFailed,
  trackSettingsOpened,
  trackSettingsUpdated,
  trackOllamaSetupFailed,
  trackApiRequestFailed,
  trackOllamaSetupCompleted,
  trackChatCreated,
  trackMessage,
  trackAiRequestStarted,
  trackAiRequestCompleted,
  trackAiRequestFailed,
  durationBucket,
  type CaptureSink,
  type CaptureDeps,
} from "./events";

export {
  filterEvent,
  type EventDraft,
  type AnalyticsCategory,
  type FilterInput,
} from "./policy";

export { clampTruncateChars } from "./clamp";
