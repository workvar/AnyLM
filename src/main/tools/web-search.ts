// Web search via DuckDuckGo's HTML endpoint. No API key required.
// Returns a plain-text list of results (title, URL, snippet) for the model.
const MAX_RESULTS = 6;
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

async function search(query) {
  const q = String(query || "").trim();
  if (!q) return "Error: query required";
  let html;
  try {
    const res = await fetch(
      "https://html.duckduckgo.com/html/?q=" + encodeURIComponent(q),
      { headers: { "User-Agent": UA } }
    );
    if (!res.ok) return `Error: search returned HTTP ${res.status}`;
    html = await res.text();
  } catch (e) {
    return `Error: ${e.message}`;
  }

  const links = [...html.matchAll(/<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)];
  const snippets = [...html.matchAll(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g)];

  const out = [];
  for (let i = 0; i < links.length && out.length < MAX_RESULTS; i++) {
    const url = targetUrl(links[i][1]);
    const title = stripHtml(links[i][2]);
    if (!title || url.includes("duckduckgo.com/y.js")) continue; // skip ads
    const snippet = snippets[i] ? stripHtml(snippets[i][1]) : "";
    out.push(`${out.length + 1}. ${title}\n   ${url}${snippet ? `\n   ${snippet}` : ""}`);
  }
  if (!out.length) return "No results found.";
  return `Search results for "${q}":\n\n${out.join("\n\n")}\n\nUse http_fetch on a URL to read a page in full.`;
}

export { search };

