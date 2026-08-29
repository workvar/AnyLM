// Worker environment bindings. GITHUB_WEBHOOK_SECRET and
// GOOGLE_SERVICE_ACCOUNT_JSON are set via `wrangler secret put`; see README.md.
export interface Env {
  GITHUB_WEBHOOK_SECRET: string;
  GOOGLE_SERVICE_ACCOUNT_JSON: string;
}
