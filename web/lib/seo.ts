import { DESCRIPTION, PRODUCT_NAME, SITE_URL as CONFIG_SITE_URL, TAGLINE } from "./config";

/** Canonical site origin with no trailing slash. */
export const SITE_URL = CONFIG_SITE_URL.replace(/\/$/, "");

/** @deprecated Prefer DESCRIPTION from config — kept for tests/callers. */
export const DEFAULT_DESCRIPTION = DESCRIPTION;

export const DEFAULT_KEYWORDS = [
  "AnyLM",
  "local LLM",
  "OpenAI compatible",
  "Ollama",
  "model router",
  "desktop AI",
];

export function getVerification(): {
  google?: string;
  other?: { "msvalidate.01": string };
} {
  const google = process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION?.trim();
  const bing = process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION?.trim();
  const out: { google?: string; other?: { "msvalidate.01": string } } = {};
  if (google) out.google = google;
  if (bing) out.other = { "msvalidate.01": bing };
  return out;
}

export function buildSoftwareJsonLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: PRODUCT_NAME,
    description: DESCRIPTION,
    url: SITE_URL,
    applicationCategory: "DeveloperApplication",
    operatingSystem: "macOS, Windows, Linux",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    slogan: TAGLINE,
  };
}
