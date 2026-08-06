// Resolved build configuration.
//
// Values come from app/.env at build time (baked in by scripts/build-env.js),
// and a real process.env variable still wins at runtime so a developer can
// point one launch at the emulator without rebuilding.
//
// Only the public allowlist in scripts/env-schema.js can reach this module.
// Secrets are not here and must not be added — see app/.env.example.
import { BUILD_ENV } from "./env.generated";

type PublicKey = keyof typeof BUILD_ENV;

function value(key: PublicKey | string, fallback = ""): string {
  const fromProcess = process.env[key as string];
  if (fromProcess != null && fromProcess !== "") return fromProcess;
  const baked = (BUILD_ENV as Record<string, string>)[key as string];
  return baked != null && baked !== "" ? baked : fallback;
}

function num(key: string, fallback: number): number {
  const n = Number(value(key, ""));
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const PROJECT_ID = value("ANYLM_FIREBASE_PROJECT");
const SITE_URL = value("ANYLM_SITE_URL", `https://${PROJECT_ID}.web.app`).replace(/\/$/, "");

export const env = {
  firebase: {
    projectId: PROJECT_ID,
    apiKey: value("ANYLM_FIREBASE_API_KEY"),
    authDomain: value("ANYLM_FIREBASE_AUTH_DOMAIN", `${PROJECT_ID}.firebaseapp.com`),
  },
  siteUrl: SITE_URL,
  // Firebase Hosting serves one page: the OAuth sign-in handler. There is no
  // API origin any more; the governance API runs in this process.
  signinUrl: `${SITE_URL}/`,
  ollamaHost: value("ANYLM_OLLAMA_HOST", "http://127.0.0.1:11434"),
  ollamaRegistry: value("ANYLM_OLLAMA_REGISTRY", "https://registry.ollama.ai"),
  embedModel: value("ANYLM_EMBED_MODEL", "nomic-embed-text"),
  proxyPort: num("ANYLM_PROXY_PORT", 3227),
  // Outlook connector. A public client id, not a secret: the flow is PKCE,
  // which is what makes a secretless exchange safe. Blank disables the skill.
  msClientId: value("ANYLM_MS_CLIENT_ID"),
} as const;

export type Env = typeof env;
