import { PRODUCT_NAME, TAGLINE } from "./config";

const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://anylm.app";
export const SITE_URL = raw.replace(/\/$/, "");

export const DEFAULT_DESCRIPTION =
  "AnyLM is a background router for local LLMs. It pools every model already installed on your machine behind one OpenAI-compatible endpoint, so no app ever loads the same weights twice.";

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
    description: DEFAULT_DESCRIPTION,
    url: SITE_URL,
    applicationCategory: "DeveloperApplication",
    operatingSystem: "macOS, Windows, Linux",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    slogan: TAGLINE,
  };
}
