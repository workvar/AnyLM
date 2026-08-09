export const GITHUB_OWNER = process.env.NEXT_PUBLIC_GITHUB_OWNER ?? "workvar";
export const GITHUB_REPO = process.env.NEXT_PUBLIC_GITHUB_REPO ?? "AnyLM";

export const REPO_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`;
export const RELEASES_URL = `${REPO_URL}/releases`;

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://anylm.app").replace(
  /\/$/,
  "",
);

export const PRODUCT_NAME = "AnyLM";
export const TAGLINE = "One router. Every model. Zero duplication.";
export const DESCRIPTION =
  "AnyLM is a local-first desktop workspace for Ollama: projects with RAG, multi-agent chat, and one OpenAI-compatible endpoint every local app can share — nothing leaves your machine for inference.";
