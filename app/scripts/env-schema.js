// Which environment variables may be baked into the shipped app bundle, and
// which must never be.
//
// The rule: anything compiled into src/main/env.generated.ts ends up inside
// the .asar of every copy we hand out. Treat that file as public. Real
// secrets belong in firebase/functions/.env (server side, behind Secret
// Manager) or in CI environment variables — never here.

/**
 * Keys that are safe to bake in. Each is a project *identifier* or a public
 * endpoint, not a credential.
 *
 * On the Firebase web API key specifically: it is not a secret. It identifies
 * the project to Identity Toolkit and authorizes nothing on its own. Every
 * read and write goes through the `api` Cloud Function, and firestore.rules
 * denies direct client access, so a copy of this key buys an attacker
 * nothing. Google documents it as shippable in client bundles.
 */
const PUBLIC_KEYS = {
  ANYLM_FIREBASE_PROJECT: { required: true, description: "Firebase project id" },
  ANYLM_FIREBASE_API_KEY: { required: true, description: "Firebase web API key (public identifier)" },
  ANYLM_FIREBASE_AUTH_DOMAIN: { required: false, description: "Defaults to <project>.firebaseapp.com" },
  ANYLM_SITE_URL: { required: false, description: "Defaults to https://<project>.web.app" },
  ANYLM_OLLAMA_HOST: { required: false, description: "Defaults to http://127.0.0.1:11434" },
  ANYLM_OLLAMA_REGISTRY: { required: false, description: "Defaults to https://registry.ollama.ai" },
  ANYLM_EMBED_MODEL: { required: false, description: "Defaults to nomic-embed-text" },
  ANYLM_PROXY_PORT: { required: false, description: "Default port for the local /v1 endpoint" },
  // A public OAuth client id for the Outlook connector. Public clients carry
  // no secret; PKCE protects the exchange, so this is safe to ship.
  ANYLM_MS_CLIENT_ID: { required: false, description: "Microsoft public client id for the Outlook skill" },
  ANYLM_POSTHOG_KEY: { required: false, description: "PostHog project API key (phc_…); empty disables analytics" },
  ANYLM_POSTHOG_HOST: { required: false, description: "PostHog host; defaults to https://us.i.posthog.com" },
};

/**
 * Anything matching these never reaches the bundle. If one shows up in
 * app/.env the build fails loudly rather than shipping it.
 */
const FORBIDDEN_PATTERNS = [
  /SECRET/i,
  /PASSWORD/i,
  /PRIVATE/i,
  /_TOKEN$/i,
  /^GH_TOKEN$/i,
  /CREDENTIAL/i,
  /^CSC_/i,
  /^APPLE_/i,
  /^WIN_CSC_/i,
  /^AWS_/i,
  /SERVICE_ACCOUNT/i,
];

function isForbidden(key) {
  return FORBIDDEN_PATTERNS.some((re) => re.test(key));
}

module.exports = { PUBLIC_KEYS, FORBIDDEN_PATTERNS, isForbidden };
