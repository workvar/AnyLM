// A one-shot HTTP server on 127.0.0.1, used as an OAuth redirect target.
//
// RFC 8252 prefers a loopback redirect over a custom URL scheme for native
// apps, and the reason matters here: any application on the machine can
// register `anylm://` and quietly intercept a callback, whereas only one
// process can hold a TCP port, and that process is us. Everything sensitive
// that comes back from a browser now lands on a port we opened.
import * as http from "http";
import { AddressInfo } from "net";
import { focusWindow } from "../window";
import { successPage, errorPage } from "./pages";

// How long the listener stays up after the callback lands, purely so the
// success page's "Launch App" button has something to talk to. The OAuth
// result is already resolved by then; this window serves nothing sensitive.
const LINGER_MS = 120_000;

export interface LoopbackResult {
  /** The redirect URI to hand the authorization server. */
  redirectUri: string;
  /** Resolves with the callback query parameters, or rejects on timeout. */
  received: Promise<Record<string, string>>;
  /** Shut the listener down early, e.g. when the user cancels. */
  close: () => void;
}

/**
 * Listen on an ephemeral loopback port for a single OAuth callback.
 *
 * `path` is the callback path the authorization server will be told to use.
 * Anything else 404s, so a stray request cannot resolve the promise.
 */
export function listen(path = "/callback", timeoutMs = 300_000): Promise<LoopbackResult> {
  return new Promise((resolveServer, rejectServer) => {
    let settle: ((q: Record<string, string>) => void) | null = null;
    let fail: ((e: Error) => void) | null = null;

    const received = new Promise<Record<string, string>>((res, rej) => {
      settle = res;
      fail = rej;
    });

    let linger: NodeJS.Timeout | null = null;

    const server = http.createServer((req, res) => {
      const url = new URL(req.url || "/", "http://127.0.0.1");

      // The success page's "Launch App" button. Same-origin, no parameters,
      // and it only raises a window, so there is nothing to validate beyond
      // the method.
      if (url.pathname === "/launch") {
        if (req.method !== "POST") {
          res.writeHead(405).end();
          return;
        }
        const raised = focusWindow();
        res.writeHead(raised ? 204 : 503).end();
        if (raised) shutdown();
        return;
      }

      if (url.pathname !== path) {
        res.writeHead(404).end();
        return;
      }
      const params: Record<string, string> = {};
      url.searchParams.forEach((v, k) => (params[k] = v));

      const ok = !params.error;
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(ok ? successPage() : errorPage(params.error_description || params.error));

      clearTimeout(timer);
      if (ok) {
        settle?.(params);
        // Stay up briefly so "Launch App" still has a server to reach.
        linger = setTimeout(shutdown, LINGER_MS);
        linger.unref?.();
      } else {
        fail?.(new Error(params.error_description || params.error));
        server.close();
      }
    });

    function shutdown(): void {
      if (linger) clearTimeout(linger);
      linger = null;
      server.close();
    }

    const timer = setTimeout(() => {
      server.close();
      fail?.(new Error("Sign-in timed out"));
    }, timeoutMs);
    // Do not hold the app open just because a browser tab was abandoned.
    timer.unref?.();

    server.on("error", rejectServer);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolveServer({
        redirectUri: `http://127.0.0.1:${port}${path}`,
        received,
        close: () => {
          clearTimeout(timer);
          shutdown();
          fail?.(new Error("Sign-in cancelled"));
        },
      });
    });
  });
}
