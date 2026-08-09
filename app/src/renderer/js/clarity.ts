// Consent-gated Microsoft Clarity in the renderer (session replay / UX only).
// Never tag message text, titles, or other sensitive content.

const ALLOWED_TAG_KEYS = new Set([
  "app",
  "platform",
  "app_version",
  "environment",
  "user_state",
]);

type ClarityFn = (...args: unknown[]) => void;

declare global {
  interface Window {
    clarity?: ClarityFn;
  }
}

let activeId: string | null = null;
let scriptEl: HTMLScriptElement | null = null;

function injectClaritySnippet(id: string): void {
  (function (c, l, a, r, i, t, y) {
    const win = c as Window & { clarity?: ClarityFn };
    win[a] =
      win[a] ||
      function (...args: unknown[]) {
        (win[a] as ClarityFn & { q?: unknown[] }).q = (win[a] as ClarityFn & { q?: unknown[] }).q || [];
        (win[a] as ClarityFn & { q: unknown[] }).q.push(args);
      };
    t = l.createElement(r) as HTMLScriptElement;
    t.async = true;
    t.src = "https://www.clarity.ms/tag/" + i;
    y = l.getElementsByTagName(r)[0];
    y.parentNode?.insertBefore(t, y);
    scriptEl = t;
  })(window, document, "clarity", "script", id);
}

/** Load the Clarity snippet once for the given project id. */
export function startClarity(id: string): void {
  if (activeId === id && scriptEl) return;
  stopClarity();
  activeId = id;
  injectClaritySnippet(id);
}

/** Tear down Clarity and ignore further tag calls. */
export function stopClarity(): void {
  activeId = null;
  if (scriptEl) {
    scriptEl.remove();
    scriptEl = null;
  }
  window.clarity = () => {};
}

/** Set coarse custom tags (allowed keys only). No-op when Clarity is stopped. */
export function setClarityTags(tags: Record<string, string>): void {
  if (!activeId || typeof window.clarity !== "function") return;
  for (const [key, value] of Object.entries(tags)) {
    if (!ALLOWED_TAG_KEYS.has(key)) continue;
    window.clarity("set", key, value);
  }
}

/** Apply config from main process: start/stop + refresh allowed tags. */
export async function syncClarity(): Promise<void> {
  const config = await window.api.analyticsClarityConfig();
  if (!config.enabled || !config.id) {
    stopClarity();
    return;
  }

  startClarity(config.id);

  const [version, user] = await Promise.all([
    window.api.getVersion(),
    window.api.authMe().catch(() => null),
  ]);

  setClarityTags({
    app: "desktop",
    platform: window.api.platform,
    app_version: version,
    environment: window.api.isPackaged ? "production" : "development",
    user_state: user ? "signed_in" : "anonymous",
  });
}
