// Firebase Auth over its REST API, rather than the firebase-js-sdk.
//
// The SDK's auth module assumes a browser: it persists sessions in
// IndexedDB/localStorage, neither of which exists in an Electron main
// process, and its popup/redirect flows need a DOM. Talking to Identity
// Toolkit directly keeps token storage on disk where the old JWT client had
// it, adds no dependency to the packaged binary, and keeps this module a
// drop-in replacement for the calls auth.js used to make against NestJS.
import { apiKey } from "./firebase-config";

const IDENTITY = "https://identitytoolkit.googleapis.com/v1";
const SECURETOKEN = "https://securetoken.googleapis.com/v1";

// Identity Toolkit returns machine-readable codes. Surface the handful users
// actually hit as the messages the old backend produced.
const FRIENDLY: Record<string, string> = {
  EMAIL_EXISTS: "Email already registered",
  EMAIL_NOT_FOUND: "Invalid email or password",
  INVALID_PASSWORD: "Invalid email or password",
  INVALID_LOGIN_CREDENTIALS: "Invalid email or password",
  USER_DISABLED: "This account has been disabled",
  WEAK_PASSWORD: "Password must be at least 6 characters",
  INVALID_EMAIL: "Enter a valid email address",
  TOO_MANY_ATTEMPTS_TRY_LATER: "Too many attempts. Try again in a few minutes.",
  OPERATION_NOT_ALLOWED: "This sign-in method is not enabled for this project.",
};

function friendly(code: unknown): string {
  const key = String(code || "").split(" : ")[0].trim();
  return FRIENDLY[key] || key.replace(/_/g, " ").toLowerCase() || "Sign-in failed";
}

async function call(url: string, body: Record<string, unknown>, form = false): Promise<any> {
  const res = await fetch(`${url}?key=${apiKey}`, {
    method: "POST",
    headers: {
      "Content-Type": form ? "application/x-www-form-urlencoded" : "application/json",
    },
    body: form ? new URLSearchParams(body as Record<string, string>) : JSON.stringify(body),
  });
  const data = ((await res.json().catch(() => ({}))) as any);
  if (!res.ok) throw new Error(friendly(data.error && data.error.message));
  return data;
}

// Normalise both response shapes (camelCase from Identity Toolkit,
// snake_case from the token endpoint) into one stored token record.
function toTokens(data: any): AuthTokens {
  const idToken = data.idToken || data.id_token;
  const refreshToken = data.refreshToken || data.refresh_token;
  const expiresIn = Number(data.expiresIn || data.expires_in || 3600);
  return {
    idToken,
    refreshToken,
    expiresAt: Date.now() + expiresIn * 1000,
    userId: data.localId || data.user_id || null,
  };
}

async function signUp(email: string, password: string): Promise<AuthTokens> {
  return toTokens(
    await call(`${IDENTITY}/accounts:signUp`, { email, password, returnSecureToken: true })
  );
}

async function signInWithPassword(email: string, password: string): Promise<AuthTokens> {
  return toTokens(
    await call(`${IDENTITY}/accounts:signInWithPassword`, {
      email,
      password,
      returnSecureToken: true,
    })
  );
}

/**
 * Exchange a third-party credential for a Firebase session.
 *
 * This is what replaced custom-token minting when the Cloud Function went
 * away. Google hands us an OIDC `id_token` from a PKCE loopback flow; GitHub
 * hands us an `access_token` from its device flow. Neither needs a server and
 * neither needs a client secret, so both can live in a distributed binary.
 *
 * `requestUri` is required by the API but is not used for anything in this
 * flow; any http(s) URL is accepted.
 */
async function signInWithIdp(providerId: string, credential: string): Promise<AuthTokens> {
  const field = providerId === "google.com" ? "id_token" : "access_token";
  return toTokens(
    await call(`${IDENTITY}/accounts:signInWithIdp`, {
      postBody: `${field}=${encodeURIComponent(credential)}&providerId=${providerId}`,
      requestUri: "http://localhost",
      returnIdpCredential: true,
      returnSecureToken: true,
    })
  );
}

/** The account behind an ID token: uid, email, display name, providers. */
async function lookup(idToken: string): Promise<{
  localId: string;
  email?: string;
  displayName?: string;
  photoUrl?: string;
  providerUserInfo?: { providerId: string }[];
}> {
  const data = await call(`${IDENTITY}/accounts:lookup`, { idToken });
  const user = data.users && data.users[0];
  if (!user) throw new Error("Account not found");
  return user;
}

async function exchangeRefreshToken(refreshToken: string): Promise<AuthTokens> {
  return toTokens(
    await call(`${SECURETOKEN}/token`, { grant_type: "refresh_token", refresh_token: refreshToken }, true)
  );
}

// Set the display name at registration. The API mirrors it into our `users`
// collection on the next /auth/me.
async function setDisplayName(idToken: string, displayName: string): Promise<void> {
  if (!displayName) return;
  await call(`${IDENTITY}/accounts:update`, {
    idToken,
    displayName,
    returnSecureToken: false,
  }).catch(() => undefined);
}

export { signUp, signInWithPassword, signInWithIdp, lookup, exchangeRefreshToken, setDisplayName };

