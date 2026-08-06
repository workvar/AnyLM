// A one-shot HTTP server on 127.0.0.1, used as an OAuth redirect target.
//
// RFC 8252 prefers a loopback redirect over a custom URL scheme for native
// apps, and the reason matters here: any application on the machine can
// register `anylm://` and quietly intercept a callback, whereas only one
// process can hold a TCP port, and that process is us. Everything sensitive
// that comes back from a browser now lands on a port we opened.
import * as http from "http";
import { AddressInfo } from "net";

export interface LoopbackResult {
  /** The redirect URI to hand the authorization server. */
  redirectUri: string;
  /** Resolves with the callback query parameters, or rejects on timeout. */
  received: Promise<Record<string, string>>;
  /** Shut the listener down early, e.g. when the user cancels. */
  close: () => void;
}

function page(title: string, body: string): string {
  return (
    `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head>` +
    `<body style="font-family:system-ui,-apple-system,sans-serif;text-align:center;padding-top:80px;color:#16181d">` +
    `<h2 style="font-size:19px">${title}</h2>` +
    `<p style="opacity:.7">${body}</p></body></html>`
  );
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

    const server = http.createServer((req, res) => {
      const url = new URL(req.url || "/", "http://127.0.0.1");
      if (url.pathname !== path) {
        res.writeHead(404).end();
        return;
      }
      const params: Record<string, string> = {};
      url.searchParams.forEach((v, k) => (params[k] = v));

      const ok = !params.error;
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(
        ok
          ? page("Signed in", "You can close this window and return to AnyLM.")
          : page("Sign-in failed", params.error_description || params.error)
      );

      clearTimeout(timer);
      server.close();
      if (ok) settle?.(params);
      else fail?.(new Error(params.error_description || params.error));
    });

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
          server.close();
          fail?.(new Error("Sign-in cancelled"));
        },
      });
    });
  });
}
