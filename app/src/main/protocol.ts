// Registers the anylm:// custom scheme and takes the single-instance lock.
//
// Deep links no longer carry anything sensitive. Both OAuth flows (sign-in
// and skill connectors) now return to a loopback port this process opened,
// because any application on the machine can register a URL scheme and
// silently intercept a callback, whereas only one process can hold a TCP
// port. See src/main/oauth/loopback.ts and RFC 8252.
//
// The scheme is still claimed for two reasons: the single-instance lock has
// to live somewhere, and keeping it registered leaves room for future deep
// links (opening a project from a link, say) without a release having to
// touch installer metadata again.
import { app } from "electron";
import * as path from "path";
import { EventEmitter } from "events";

const SCHEME = "anylm";
const emitter = new EventEmitter();

// Register the scheme. Packaged builds register via the OS installer, but in
// dev (electron .) we must point the OS at the electron binary + entry script.
function claimScheme(): void {
  if (process.defaultApp && process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(SCHEME, process.execPath, [path.resolve(process.argv[1])]);
  } else {
    app.setAsDefaultProtocolClient(SCHEME);
  }
}

/** Re-emit an incoming deep link for anyone who wants to listen. */
function handleUrl(url: string | undefined): void {
  if (!url || !url.startsWith(`${SCHEME}://`)) return;
  try {
    const parsed = new URL(url);
    const params: Record<string, string> = {};
    parsed.searchParams.forEach((v, k) => (params[k] = v));
    emitter.emit("link", { host: parsed.host, path: parsed.pathname, params });
  } catch {
    /* ignore malformed deep links */
  }
}

function registerProtocol(): void {
  claimScheme();

  // Only one instance should own the scheme; a second launch forwards its argv.
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }

  // Windows / Linux: the deep link arrives as an argv entry of the 2nd instance.
  app.on("second-instance", (_e, argv) => {
    handleUrl(argv.find((a) => a.startsWith(`${SCHEME}://`)));
  });

  // macOS: deep links come through open-url.
  app.on("open-url", (event, url) => {
    event.preventDefault();
    handleUrl(url);
  });
}

export { registerProtocol, emitter, SCHEME };
