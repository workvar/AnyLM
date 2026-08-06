// Release notes from a GitHub release come through as an HTML string (or an
// array of {version, note} when several versions were skipped). The renderer
// only ever shows plain text, so flatten and strip here in the main process.

const MAX_CHARS = 1200;

function stripHtml(html) {
  return String(html)
    .replace(/<\/(p|div|li|h\d)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Accepts undefined | string | Array<{ version, note }>.
function normalize(releaseNotes) {
  if (!releaseNotes) return "";

  const text = Array.isArray(releaseNotes)
    ? releaseNotes
        .map((r) => `${r.version ? `v${r.version}\n` : ""}${stripHtml(r.note || "")}`)
        .join("\n\n")
    : stripHtml(releaseNotes);

  return text.length > MAX_CHARS ? `${text.slice(0, MAX_CHARS).trimEnd()}…` : text;
}

export { normalize };

