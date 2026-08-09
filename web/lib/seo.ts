import { headers } from "next/headers";
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

/**
 * Absolute origin for Open Graph / Twitter images.
 * Prefer the request host so shared preview URLs (e.g. anylm.workvar.com)
 * do not point og:image at a different domain that does not serve /og.png.
 */
export async function resolveMetadataBase(): Promise<URL> {
  try {
    const h = await headers();
    const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(",")[0]?.trim();
    if (host) {
      const proto = (h.get("x-forwarded-proto") ?? "https").split(",")[0]?.trim() || "https";
      return new URL(`${proto}://${host}`);
    }
  } catch {
    // headers() throws outside a request (tests / build without request context)
  }
  return new URL(SITE_URL);
}

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
