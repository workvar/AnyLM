// The two pages the loopback server renders in the user's browser once an
// OAuth callback lands. They are the last thing the user sees before returning
// to the app, so they carry the app's look rather than raw default HTML.
//
// Everything is inline: this server is one-shot and ephemeral, so there is no
// asset pipeline and no second request to spend on a stylesheet.

const SHELL = (title: string, body: string) => `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px;
    font: 15px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif;
    background: #f6f7f9; color: #16181d;
  }
  .card {
    width: min(400px, 100%); padding: 36px 32px 28px; border-radius: 16px;
    background: #fff; border: 1px solid #e3e5e9; text-align: center;
    box-shadow: 0 1px 2px rgba(16, 18, 22, .04), 0 12px 32px rgba(16, 18, 22, .07);
    animation: rise .32s cubic-bezier(.2, .7, .3, 1) both;
  }
  @keyframes rise { from { opacity: 0; transform: translateY(8px); } }
  .badge {
    width: 56px; height: 56px; margin: 0 auto 18px; border-radius: 50%;
    display: grid; place-items: center;
  }
  .badge svg { width: 28px; height: 28px; }
  .ok   { background: #e7f6ec; color: #14804a; }
  .bad  { background: #fdeaea; color: #c02b2b; }
  h1 { font-size: 20px; letter-spacing: -.01em; margin: 0 0 6px; }
  p  { margin: 0; font-size: 14px; opacity: .68; }
  .actions { margin-top: 24px; }
  .btn {
    display: inline-flex; align-items: center; justify-content: center; gap: 8px;
    width: 100%; padding: 11px 18px; font: inherit; font-weight: 550; font-size: 15px;
    border: 0; border-radius: 10px; cursor: pointer; color: #fff;
    background: linear-gradient(180deg, #4c6ef5, #3b5bdb);
    box-shadow: 0 1px 2px rgba(30, 50, 130, .3);
    transition: transform .12s ease, filter .12s ease;
  }
  .btn:hover  { filter: brightness(1.07); }
  .btn:active { transform: translateY(1px); }
  .btn svg { width: 16px; height: 16px; }
  .hint { margin-top: 12px; font-size: 13px; opacity: .5; }
  @media (prefers-color-scheme: dark) {
    body { background: #101216; color: #e8eaed; }
    .card { background: #1a1d23; border-color: #292d35;
            box-shadow: 0 12px 32px rgba(0, 0, 0, .45); }
    .ok  { background: #12301f; color: #56d38a; }
    .bad { background: #331616; color: #f08585; }
  }
  @media (prefers-reduced-motion: reduce) { .card { animation: none; } }
</style>
</head><body><main class="card">${body}</main></body></html>`;

const CHECK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"
  stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.6 9.2 18 20 6.4"/></svg>`;

const CROSS = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"
  stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>`;

// An arrow leaving a window: the standard "open the application" mark.
const LAUNCH = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
  stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6"/><path d="M20 4 11 13"/>
  <path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/></svg>`;

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

/**
 * Success page. The button asks this same loopback server to raise the app
 * window, which works without a custom URL scheme and without leaving the
 * machine. If the app has already gone away the button just closes the tab.
 */
export function successPage(): string {
  return SHELL(
    "Signed in to AnyLM",
    `<div class="badge ok">${CHECK}</div>
     <h1>You're signed in</h1>
     <p>AnyLM has your session. You can head back to the app.</p>
     <div class="actions">
       <button class="btn" id="launch">${LAUNCH}<span>Launch App</span></button>
       <div class="hint" id="hint">This window can be closed.</div>
     </div>
     <script>
       var btn = document.getElementById("launch");
       var hint = document.getElementById("hint");
       btn.addEventListener("click", function () {
         fetch("/launch", { method: "POST" })
           .then(function (r) { return r.ok; })
           .catch(function () { return false; })
           .then(function (ok) {
             hint.textContent = ok
               ? "Opening AnyLM..."
               : "AnyLM isn't responding. Open it from your dock or taskbar.";
             if (ok) setTimeout(function () { window.close(); }, 600);
           });
       });
     <\/script>`
  );
}

/** Failure page. No launch action: there is nothing useful to return to yet. */
export function errorPage(reason: string): string {
  return SHELL(
    "Sign-in failed",
    `<div class="badge bad">${CROSS}</div>
     <h1>Sign-in failed</h1>
     <p>${escapeHtml(reason || "Something went wrong. Try again from AnyLM.")}</p>
     <div class="hint" style="margin-top:22px">You can close this window.</div>`
  );
}
