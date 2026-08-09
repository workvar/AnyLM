export {
  init,
  shutdown,
  identify,
  reset,
  isEnabled,
  getClient,
  getDistinctId,
  getAnonymousDistinctId,
} from "./client";

export {
  capture,
  captureWith,
  trackAppOpened,
  trackConsentSet,
  trackFeatureUsed,
  trackChatCreated,
  trackMessage,
  trackChatCompleted,
  trackChatFailed,
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
