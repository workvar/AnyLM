// The OpenAI-compatible router, now running inside the Electron main
// process instead of the NestJS backend.
//
// This is the one piece of the old backend that could not move to Firebase:
// it forwards to Ollama on 127.0.0.1, which no cloud function can reach.
// Running it here is also what the product is for, a single local endpoint
// other apps point at, and it means users no longer have to start a separate
// server to use it.
//
// Bound to loopback only. Anything reaching it still needs a valid `anylm_`
// API key, which is verified in the cloud, so a local listener is not a way
// around governance.
import * as http from "http";
import * as analytics from "../analytics";
import * as handlers from "./handlers";
import * as cloud from "./cloud";

const DEFAULT_PORT = 3227;
let server = null;
let activePort = null;

function readJson<T = any>(req): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let raw = "";
    req.on("data", (c) => {
      raw += c;
      // Refuse absurd payloads rather than buffering them.
      if (raw.length > 4_000_000) reject(new Error("Request body too large"));
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function proxyOperation(req: http.IncomingMessage): string {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const path = url.pathname.replace(/\/+$/, "") || "/";
  if (path === "/v1/models") return "proxy_models";
  if (path === "/v1/chat/completions") return "proxy_chat_completions";
  return "proxy_request";
}

function coarseProxyErrorType(status: number): string {
  if (status === 401) return "auth_failed";
  if (status === 403) return "policy_blocked";
  if (status === 400) return "bad_request";
  if (status === 404) return "not_found";
  return "proxy_error";
}

function trackProxyFailure(req: http.IncomingMessage, status: number): void {
  try {
    analytics.trackApiRequestFailed({
      operation: proxyOperation(req),
      error_type: coarseProxyErrorType(status),
      http_status: status,
    });
  } catch {
    // never throw into proxy flow
  }
}

function fail(res, status, message, req?: http.IncomingMessage) {
  if (req) trackProxyFailure(req, status);
  if (res.headersSent) {
    res.end();
    return;
  }
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: { message, type: "anylm_error" } }));
}

function bearerOf(req) {
  return (req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
}

async function route(req, res) {
  const url = new URL(req.url, "http://127.0.0.1");
  const path = url.pathname.replace(/\/+$/, "") || "/";

  if (path === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, service: "anylm-proxy" }));
    return;
  }

  const bearer = bearerOf(req);
  if (!bearer.startsWith("anylm_")) {
    fail(res, 401, "Invalid API key. Create one in AnyLM under Settings > API keys.", req);
    return;
  }
  // Resolve the key to its owner once, and confirm it is the account signed
  // in on this machine. Firestore is reached under that user's token, so a
  // key from another account must not be honoured here.
  const userId = await cloud.authenticate(bearer);

  if (req.method === "GET" && path === "/v1/models") {
    await handlers.models(userId, res);
    return;
  }
  if (req.method === "POST" && path === "/v1/chat/completions") {
    await handlers.chatCompletions(userId, await readJson(req), res);
    return;
  }
  fail(res, 404, `No route for ${req.method} ${path}`, req);
}

function start(port = DEFAULT_PORT) {
  if (server) return Promise.resolve(activePort);
  return new Promise((resolve) => {
    server = http.createServer((req, res) => {
      route(req, res).catch((e) =>
        fail(res, e.status || 500, e.message || "Proxy error", req),
      );
    });
    // A busy port means another AnyLM is already serving; report rather than
    // silently binding somewhere clients are not looking.
    server.on("error", (e) => {
      console.error(`[proxy] could not listen on ${port}: ${e.message}`);
      server = null;
      activePort = null;
      resolve(null);
    });
    server.listen(port, "127.0.0.1", () => {
      activePort = port;
      console.log(`[proxy] OpenAI-compatible endpoint on http://127.0.0.1:${port}/v1`);
      resolve(port);
    });
  });
}

function stop() {
  if (!server) return;
  server.close();
  server = null;
  activePort = null;
}

function status() {
  return { running: !!server, port: activePort, baseUrl: activePort ? `http://127.0.0.1:${activePort}/v1` : null };
}

export { start, stop, status, DEFAULT_PORT };

