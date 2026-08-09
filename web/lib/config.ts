export const GITHUB_OWNER = process.env.NEXT_PUBLIC_GITHUB_OWNER ?? "workvar";
export const GITHUB_REPO = process.env.NEXT_PUBLIC_GITHUB_REPO ?? "AnyLM";

export const REPO_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`;
export const RELEASES_URL = `${REPO_URL}/releases`;

/** Prefer the public hostname that actually serves this app (OG/canonical). */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL.replace(/^https?:\/\//, "")}`
    : "https://anylm.workvar.com")
).replace(/\/$/, "");

export const PRODUCT_NAME = "AnyLM";
export const TAGLINE = "One router. Every model. Zero duplication.";
/** Keep ≤ ~155 chars (search) and ideally ≤ ~125 (social OG previews). */
export const DESCRIPTION =
  "AnyLM: local Ollama workspace with projects, RAG, multi-agent chat, and one OpenAI-compatible endpoint for every local app.";
