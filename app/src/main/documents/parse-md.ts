// Shared line-level markdown parser for the DOCX/PPTX builders.
// Produces a flat list of blocks: heading | bullet | numbered | code | table | text.
import { alignments, isDelimiterRow, isTableStart, isTableRow, splitRow } from "./md-table";

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

// Returns [{ kind, level?, text?, header?, rows?, align? }]
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
    // A pipe table is one block, not a run of stray text lines. Without this
    // it renders as literal "| a | b |" — the commonest "why is it not
    // formatted" complaint.
    if (isTableStart(lines, i)) {
      const header = splitRow(lines[i]).map(stripInline);
      const align = alignments(lines[i + 1]);
      i += 2;
      const rows = [];
      while (i < lines.length && isTableRow(lines[i]) && !isDelimiterRow(lines[i])) {
        rows.push(splitRow(lines[i]).map(stripInline));
        i++;
      }
      blocks.push({ kind: "table", header, rows, align });
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
