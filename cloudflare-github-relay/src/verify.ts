// GitHub signs every webhook body with HMAC-SHA256 over the raw bytes,
// keyed by the secret you set when registering the webhook. Verifying it
// is the only thing standing between "a webhook from GitHub" and "a POST
// from anyone who finds this URL", so it happens before anything else runs.
function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Constant-time-ish compare: length check first, then compare every byte
// regardless of an early mismatch, so timing doesn't leak how much matched.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyGitHubSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string
): Promise<boolean> {
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const expected = `sha256=${toHex(mac)}`;
  return timingSafeEqual(expected, signatureHeader);
}
