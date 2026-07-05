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

// Route incoming deep links:
//   anylm://auth/callback?accessToken=…&refreshToken=…  → "tokens"
//   anylm://connectors/callback?provider=…              → "connector"
function handleUrl(url) {
  if (!url || !url.startsWith(`${SCHEME}://`)) return;
  try {
    const parsed = new URL(url);
    const q = parsed.searchParams;
    if (parsed.host === "connectors") {
      emitter.emit("connector", { provider: q.get("provider") });
      return;
    }
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

// Resolve when a connector OAuth flow lands back in the app.
function waitForConnector(timeoutMs = 300000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      emitter.off("connector", onConnector);
      reject(new Error("Connecting timed out"));
    }, timeoutMs);
    function onConnector(info) {
      clearTimeout(timer);
      resolve(info);
    }
    emitter.once("connector", onConnector);
  });
}

module.exports = { registerProtocol, waitForTokens, waitForConnector, SCHEME };
