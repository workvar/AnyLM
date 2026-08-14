// GFM pipe-table detection for the markdown → HTML renderer.
// Without this, a markdown table in a generated PDF/DOCX renders as literal
// "| a | b |" text lines, which is the single most common reason a document
// looks unformatted.

export function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|\s*$/, "")
    .split("|")
    .map((c) => c.trim());
}

// "| --- | :---: |" — the row that turns the line above it into a header.
export function isDelimiterRow(line: string): boolean {
  if (!/\|/.test(line)) return false;
  const cells = splitRow(line);
  return cells.length > 0 && cells.every((c) => /^:?-{2,}:?$/.test(c));
}

export function isTableStart(lines: string[], i: number): boolean {
  const head = lines[i];
  const delim = lines[i + 1];
  if (!head || !delim || !/\|/.test(head)) return false;
  if (!isDelimiterRow(delim)) return false;
  return splitRow(head).length === splitRow(delim).length;
}

export function alignments(delimiterLine: string): Array<string | null> {
  return splitRow(delimiterLine).map((c) => {
    const left = c.startsWith(":");
    const right = c.endsWith(":");
    if (left && right) return "center";
    if (right) return "right";
    return null;
  });
}

export function isTableRow(line: string): boolean {
  return /\|/.test(line) && line.trim() !== "";
}
