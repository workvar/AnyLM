// Shared line-level markdown parser for the DOCX/PPTX builders.
// Produces a flat list of blocks: heading | bullet | numbered | code | text.

function stripInline(s) {
  return String(s || "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)\s]+\)/g, "$1");
}

// Returns [{ kind, level?, text }]
function parseBlocks(markdown) {
  const lines = String(markdown || "").replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^```/.test(line)) {
      i++;
      const buf = [];
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++; // closing fence
      blocks.push({ kind: "code", text: buf.join("\n") });
      continue;
    }
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      blocks.push({ kind: "heading", level: h[1].length, text: stripInline(h[2]) });
      i++;
      continue;
    }
    if (/^\s*[-*+]\s+/.test(line)) {
      blocks.push({ kind: "bullet", text: stripInline(line.replace(/^\s*[-*+]\s+/, "")) });
      i++;
      continue;
    }
    const n = line.match(/^\s*\d+\.\s+(.*)$/);
    if (n) {
      blocks.push({ kind: "numbered", text: stripInline(n[1]) });
      i++;
      continue;
    }
    if (!/^\s*$/.test(line)) {
      blocks.push({ kind: "text", text: stripInline(line.replace(/^>\s?/, "")) });
    }
    i++;
  }
  return blocks;
}

export { parseBlocks, stripInline };

