// Registers the anylm:// custom scheme and turns incoming deep links into
// events. The OAuth flow resolves when anylm://auth/callback arrives, so it
// no longer depends on intercepting a localhost redirect on a fixed port.
const { app } = require("electron");
const path = require("path");
const { EventEmitter } = require("events");

const SCHEME = "anylm";
const emitter = new EventEmitter();

// Register the scheme. Packaged builds register via the OS installer, but in
// dev (electron .) we must point the OS at the electron binary + entry script.
function claimScheme() {
  if (process.defaultApp && process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(SCHEME, process.execPath, [
      path.resolve(process.argv[1]),
    ]);
  } else {
    app.setAsDefaultProtocolClient(SCHEME);
  }
}

// Pull tokens out of an anylm://auth/callback?accessToken=...&refreshToken=...
function handleUrl(url) {
  if (!url || !url.startsWith(`${SCHEME}://`)) return;
  try {
    const q = new URL(url).searchParams;
    const accessToken = q.get("accessToken");
    const refreshToken = q.get("refreshToken");
    if (accessToken && refreshToken) {
      emitter.emit("tokens", { accessToken, refreshToken });
    }
  } catch {
    /* ignore malformed deep links */
  }
}

function registerProtocol() {
  claimScheme();

  // Only one instance should own the scheme; a second launch forwards its argv.
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }

  // Windows / Linux: the deep link arrives as an argv entry of the 2nd instance.
  app.on("second-instance", (_e, argv) => {
    const url = argv.find((a) => a.startsWith(`${SCHEME}://`));
    handleUrl(url);
  });

  // macOS: deep links come through open-url.
  app.on("open-url", (event, url) => {
    event.preventDefault();
    handleUrl(url);
  });
}

// Resolve with the next set of tokens, or reject on timeout.
function waitForTokens(timeoutMs = 300000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      emitter.off("tokens", onTokens);
      reject(new Error("Sign-in timed out"));
    }, timeoutMs);
    function onTokens(tokens) {
      clearTimeout(timer);
      resolve(tokens);
    }
    emitter.once("tokens", onTokens);
  });
}

module.exports = { registerProtocol, waitForTokens, SCHEME };
