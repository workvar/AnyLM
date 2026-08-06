// Markdown / CSV → a rectangular grid of cells, for the spreadsheet builder.
import { stripInline } from "./parse-md";

const SEPARATOR = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

function splitPipes(line: string): string[] {
  return line
    .replace(/^\s*\|/, "")
    .replace(/\|\s*$/, "")
    .split("|")
    .map((c) => stripInline(c.trim()));
}

function splitCsv(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

// Returns { rows, hasHeader }. Pipe tables win; otherwise comma-separated
// lines are treated as rows; anything else lands in a single column.
function parseRows(markdown: string): { rows: string[][]; hasHeader: boolean } {
  const lines = String(markdown || "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((l) => l.trim() !== "");

  const piped = lines.filter((l) => l.includes("|") && !SEPARATOR.test(l));
  if (piped.length >= 2) {
    const rows = piped.map(splitPipes);
    const width = Math.max(...rows.map((r) => r.length));
    return {
      rows: rows.map((r) => [...r, ...Array(width - r.length).fill("")]),
      hasHeader: lines.some((l) => SEPARATOR.test(l)),
    };
  }

  const commas = lines.filter((l) => l.includes(","));
  if (commas.length >= 2 && commas.length === lines.length) {
    const rows = commas.map(splitCsv);
    const width = Math.max(...rows.map((r) => r.length));
    return {
      rows: rows.map((r) => [...r, ...Array(width - r.length).fill("")]),
      hasHeader: true,
    };
  }

  const rows = lines.map((l) => [stripInline(l.replace(/^#{1,6}\s+|^\s*[-*+]\s+/, ""))]);
  return { rows: rows.length ? rows : [[""]], hasHeader: false };
}

export { parseRows };
