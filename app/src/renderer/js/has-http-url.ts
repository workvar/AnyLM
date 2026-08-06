// src/renderer/js/has-http-url.ts
const RE = /https?:\/\/[^\s<>"'`]+/i;

function hasHttpUrl(text: unknown): boolean {
  return RE.test(String(text ?? ""));
}

export { hasHttpUrl };
