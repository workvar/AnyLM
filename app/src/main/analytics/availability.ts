/** True when GA4 or Microsoft Clarity is configured for this build. */
export function analyticsAvailable(input: {
  gaEnabled: boolean;
  clarityId: string;
}): boolean {
  return input.gaEnabled || Boolean(input.clarityId);
}
