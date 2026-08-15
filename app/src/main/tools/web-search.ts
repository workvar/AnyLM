// Web search via DuckDuckGo's HTML endpoint. No API key required.
// Returns a plain-text list of results (title, URL, snippet) for the model.
//
// DDG rate-limits bursts: several searches in one turn start coming back as
// an empty result page. That is indistinguishable from a genuinely empty
// search unless we say so — and "No results found." makes the model retry the
// same query forever. So: two endpoints, a backoff retry, and an error string
// that tells the model what to do instead.
const MAX_RESULTS = 8;
const ENDPOINTS = [
  "https://html.duckduckgo.com/html/?q=",
  "https://lite.duckduckgo.com/lite/?q=",
];
const RETRY_DELAY_MS = 1200;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

function stripHtml(s) {
  return String(s)
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// DDG wraps result links: //duckduckgo.com/l/?uddg=<encoded-url>&rut=…
function targetUrl(href) {
  const m = String(href).match(/[?&]uddg=([^&]+)/);
  try {
    return m ? decodeURIComponent(m[1]) : href;
  } catch {
    return href;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Parse one DDG results page. The HTML and Lite endpoints use different
// markup, so try the rich selectors first and fall back to any outbound link.
function parseResults(html) {
  const links = [...html.matchAll(/<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)];
  const snippets = [...html.matchAll(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g)];
  const rows = links.length
    ? links
    : [...html.matchAll(/<a[^>]*href="(\/\/duckduckgo\.com\/l\/\?uddg=[^"]+)"[^>]*>([\s\S]*?)<\/a>/g)];

  const out = [];
  const seen = new Set();
  for (let i = 0; i < rows.length && out.length < MAX_RESULTS; i++) {
    const url = targetUrl(rows[i][1]);
    const title = stripHtml(rows[i][2]);
    if (!title || url.includes("duckduckgo.com/y.js")) continue; // skip ads
    if (seen.has(url)) continue;
    seen.add(url);
    const snippet = snippets[i] ? stripHtml(snippets[i][1]) : "";
    out.push(`${out.length + 1}. ${title}\n   ${url}${snippet ? `\n   ${snippet}` : ""}`);
  }
  return out;
}

async function fetchPage(endpoint, q) {
  const res = await fetch(endpoint + encodeURIComponent(q), {
    headers: { "User-Agent": UA },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function search(query) {
  const q = String(query || "").trim();
  if (!q) return "Error: query required";

  let out = [];
  let lastError = "";
  for (let attempt = 0; attempt < ENDPOINTS.length; attempt++) {
    if (attempt > 0) await sleep(RETRY_DELAY_MS);
    try {
      out = parseResults(await fetchPage(ENDPOINTS[attempt], q));
    } catch (e) {
      lastError = e.message;
      continue;
    }
    if (out.length) break;
  }

  if (!out.length) {
    // Empty after both endpoints is far more often throttling than a query
    // with no matches, so steer the model off the retry loop either way.
    return (
      `No results for "${q}"${lastError ? ` (last error: ${lastError})` : ""}. ` +
      "The search backend may be rate-limiting this turn. Do NOT repeat this query — " +
      "either try a clearly different wording, use a URL you already have, or continue " +
      "from what you already know and say which parts are unverified."
    );
  }
  return `Search results for "${q}":\n\n${out.join("\n\n")}\n\nUse http_fetch to read the most relevant pages in full — read 3–5 distinct sources before writing, and search again with a different angle if these do not cover the topic.`;
}

export { search };

