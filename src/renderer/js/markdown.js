// Minimal, safe Markdown -> HTML for chat bubbles. Everything is HTML-escaped
// before any tags are emitted, and only a known subset of tags is produced, so
// model output cannot inject markup. No external dependency.

const SENTINEL = "\u0000"; // never appears in model text; survives escaping

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Inline formatting for a single line of raw text.
function inline(raw) {
  // Protect inline-code spans from other transforms.
  const codes = [];
  let s = raw.replace(/`([^`]+)`/g, (_m, c) => {
    codes.push(c);
    return SENTINEL + (codes.length - 1) + SENTINEL;
  });

  s = escapeHtml(s);

  // Links: [text](url) with a scheme allowlist.
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, text, url) => {
    const safe = /^(https?:|mailto:)/i.test(url) ? url.replace(/"/g, "%22") : "#";
    return `<a href="${safe}" target="_blank" rel="noopener noreferrer">${text}</a>`;
  });

  s = s
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_]+)__/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/_([^_]+)_/g, "<em>$1</em>")
    .replace(/~~([^~]+)~~/g, "<del>$1</del>");

  // Restore (escaped) inline code.
  const restore = new RegExp(SENTINEL + "(\\d+)" + SENTINEL, "g");
  return s.replace(restore, (_m, i) => `<code>${escapeHtml(codes[+i] || "")}</code>`);
}

export function renderMarkdown(src) {
  const lines = (src || "").replace(/\r\n/g, "\n").split("\n");
  let html = "";
  let para = [];
  const flush = () => {
    if (para.length) {
      html += `<p>${para.map(inline).join("<br>")}</p>`;
      para = [];
    }
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (/^```/.test(line)) {
      flush();
      i++;
      const buf = [];
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++; // closing fence
      html += `<pre><code>${escapeHtml(buf.join("\n"))}</code></pre>`;
      continue;
    }
    if (/^\s*$/.test(line)) {
      flush();
      i++;
      continue;
    }
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      flush();
      html += `<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`;
      i++;
      continue;
    }
    if (/^\s*([-*_])\1\1+\s*$/.test(line)) {
      flush();
      html += "<hr>";
      i++;
      continue;
    }
    if (/^>\s?/.test(line)) {
      flush();
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ""));
      html += `<blockquote>${buf.map(inline).join("<br>")}</blockquote>`;
      continue;
    }
    if (/^\s*[-*+]\s+/.test(line)) {
      flush();
      const buf = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i]))
        buf.push(lines[i++].replace(/^\s*[-*+]\s+/, ""));
      html += `<ul>${buf.map((x) => `<li>${inline(x)}</li>`).join("")}</ul>`;
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      flush();
      const buf = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i]))
        buf.push(lines[i++].replace(/^\s*\d+\.\s+/, ""));
      html += `<ol>${buf.map((x) => `<li>${inline(x)}</li>`).join("")}</ol>`;
      continue;
    }

    para.push(line);
    i++;
  }
  flush();
  return html;
}
