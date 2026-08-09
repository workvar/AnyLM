const MIN_BODY_CHARS = 400;
const STEP_STUB_BODY_CHARS = 800;

export const THIN_CONTENT_ERROR =
  "content too thin — each heading needs real paragraphs/details; " +
  "research with web_search/http_fetch if needed, then call generate_document " +
  "again with full markdown (no empty sections or step titles alone).";

type ContentLine = { text: string; fenced: boolean };

function contentLines(markdown: string): ContentLine[] {
  let fenced = false;
  return String(markdown || "").split(/\r?\n/).map((text) => {
    if (/^\s*(```|~~~)/.test(text)) {
      fenced = !fenced;
      return { text, fenced: true };
    }
    return { text, fenced };
  });
}

function isHeading(line: ContentLine): boolean {
  if (line.fenced) return false;
  return /^#{1,6}\s+\S/.test(line.text);
}

function headingLevel(line: ContentLine): number {
  const m = line.text.match(/^(#{1,6})\s+/);
  return m ? m[1].length : 0;
}

function isStepStubLine(line: string): boolean {
  return /^\s*(?:[-*+]|\d+\.)\s+Step\s+\d+\s*:/i.test(line);
}

function bodyCharCount(markdown: string): number {
  let n = 0;
  for (const line of contentLines(markdown)) {
    if (isHeading(line)) continue;
    n += line.text.replace(/\s+/g, "").length;
  }
  return n;
}

function nextHeadingAtOrAbove(lines: ContentLine[], start: number, level: number): number {
  for (let i = start + 1; i < lines.length; i++) {
    if (isHeading(lines[i]) && headingLevel(lines[i]) <= level) return i;
  }
  return lines.length;
}

function sectionHasBody(lines: ContentLine[], start: number, level: number): boolean {
  const end = nextHeadingAtOrAbove(lines, start, level);
  for (let i = start + 1; i < end; i++) {
    if (isHeading(lines[i])) {
      if (sectionHasBody(lines, i, headingLevel(lines[i]))) return true;
      continue;
    }
    if (lines[i].text.trim()) return true;
  }
  return false;
}

function emptyHeadingCount(markdown: string): number {
  const lines = contentLines(markdown);
  let empty = 0;
  for (let i = 0; i < lines.length; i++) {
    if (!isHeading(lines[i])) continue;
    if (!sectionHasBody(lines, i, headingLevel(lines[i]))) empty++;
  }
  return empty;
}

function stepStubCount(markdown: string): number {
  let n = 0;
  for (const line of String(markdown || "").split(/\r?\n/)) {
    if (isStepStubLine(line)) n++;
  }
  return n;
}

export function assessDocumentContent(
  markdown: string
): { ok: true } | { ok: false; reason: string } {
  const body = bodyCharCount(markdown);
  if (body < MIN_BODY_CHARS) {
    return { ok: false, reason: `body too short (${body} chars; need ≥${MIN_BODY_CHARS})` };
  }
  const empty = emptyHeadingCount(markdown);
  if (empty >= 2) {
    return { ok: false, reason: `${empty} headings have no body content` };
  }
  const stubs = stepStubCount(markdown);
  if (stubs >= 3 && body < STEP_STUB_BODY_CHARS) {
    return { ok: false, reason: "too many step titles without explanatory prose" };
  }
  return { ok: true };
}

export function shouldAssessDocumentContent(format: string): boolean {
  const fmt = String(format || "").toLowerCase().trim();
  return fmt === "pdf" || fmt === "docx" || fmt === "md";
}

export function assertDocumentContentOrThrow(format: string, content: string): void {
  if (!shouldAssessDocumentContent(format)) return;
  const r = assessDocumentContent(content);
  if (!r.ok) throw new Error(THIN_CONTENT_ERROR);
}
