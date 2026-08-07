// Connector provider definitions: OAuth endpoints, scopes, and which env
// vars hold the client credentials. Add a provider here (and a matching
// built-in skill in the app) to light up a new connector.
export interface ProviderDef {
  id: string;
  label: string;
  authUrl: string;
  tokenUrl: string;
  scope: string;
  clientIdEnv: string;
  clientSecretEnv: string;
  // Extra query params for the consent screen (offline access etc.).
  extraAuthParams: Record<string, string>;
}

export const PROVIDERS: Record<string, ProviderDef> = {
  "google-calendar": {
    id: "google-calendar",
    label: "Google Calendar",
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scope:
      "https://www.googleapis.com/auth/calendar.events " +
      "https://www.googleapis.com/auth/calendar.readonly " +
      "https://www.googleapis.com/auth/userinfo.email",
    clientIdEnv: "GOOGLE_CLIENT_ID",
    clientSecretEnv: "GOOGLE_CLIENT_SECRET",
    // Google only returns a refresh token with offline access + forced consent.
    extraAuthParams: { access_type: "offline", prompt: "consent" },
  },
  outlook: {
    id: "outlook",
    label: "Outlook (Microsoft 365)",
    authUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    scope:
      "offline_access User.Read Calendars.ReadWrite Mail.Read Mail.Send",
    clientIdEnv: "MS_CLIENT_ID",
    clientSecretEnv: "MS_CLIENT_SECRET",
    extraAuthParams: {},
  },
};

export function providerOrThrow(id: string): ProviderDef {
  const p = PROVIDERS[id];
  if (!p) throw new Error(`Unknown connector provider "${id}"`);
  return p;
}
