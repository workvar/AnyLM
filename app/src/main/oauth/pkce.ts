// PKCE (RFC 7636) parameters.
//
// PKCE is what makes an OAuth flow safe for an application that cannot keep a
// secret. The app invents a random verifier, sends only its hash to the
// authorization server, and proves possession of the original when redeeming
// the code. An attacker who intercepts the code cannot use it.
import { createHash, randomBytes } from "crypto";

export interface Pkce {
  verifier: string;
  challenge: string;
  method: "S256";
  state: string;
}

function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function create(): Pkce {
  // 32 random bytes gives a 43-character verifier, the RFC's minimum.
  const verifier = base64url(randomBytes(32));
  return {
    verifier,
    challenge: base64url(createHash("sha256").update(verifier).digest()),
    method: "S256",
    state: base64url(randomBytes(24)),
  };
}
