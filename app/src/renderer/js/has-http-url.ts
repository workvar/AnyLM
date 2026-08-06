// src/renderer/js/has-http-url.ts
// Require at least one hostname label after :// (reject https://?x, https://#, etc.)
const RE =
  /https?:\/\/(?:[a-z0-9](?:[-a-z0-9]*[a-z0-9])?\.)*[a-z0-9](?:[-a-z0-9]*[a-z0-9])?(?:[/?#][^\s<>"'`]*)?/i;

function hasHttpUrl(text: unknown): boolean {
  return RE.test(String(text ?? ""));
}

export { hasHttpUrl };
