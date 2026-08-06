// "I want a PDF" → the document tool, without the user flipping the tools
// toggle first. Reads only the latest user message, deliberately: an earlier
// mention of a spreadsheet should not make every later reply write a file.

const FORMAT_WORDS: Array<[string, RegExp]> = [
  ["xlsx", /\b(spreadsheet|excel|xlsx?|workbook|csv)\b/i],
  ["pptx", /\b(presentation|slide deck|slides?|powerpoint|pptx?|deck)\b/i],
  ["docx", /\b(word (doc|document|file)|docx?|\.doc\b)\b/i],
  ["pdf", /\bpdf\b/i],
  ["md", /\b(markdown file|\.md\b|md file)\b/i],
];

// Verbs that mean "produce a file", as opposed to talking about one.
const WANTS =
  /\b(make|create|generate|build|write|produce|export|save|draft|prepare|turn (this|that|it) into|give me|send me|i (want|need)|can you (make|create|write|prepare))\b/i;

// Phrases that mean the user is asking about a file, not for one.
const NOT_WANTS = /\b(what is|how do i|explain|difference between|instead of)\b/i;

// Returns "pdf" | "docx" | "pptx" | "xlsx" | "md" | null.
function detect(text: unknown): string | null {
  const s = String(text || "");
  if (!s.trim() || NOT_WANTS.test(s)) return null;
  if (!WANTS.test(s)) return null;
  for (const [format, re] of FORMAT_WORDS) {
    if (re.test(s)) return format;
  }
  // "write this up as a document / report / one-pager" with no format named.
  if (/\b(document|report|one[- ]pager|memo|write[- ]?up)\b/i.test(s)) return "docx";
  return null;
}

// System nudge added when intent is detected, so the model reaches for the
// tool instead of pasting the document into the reply.
function promptBlock(format: string): string {
  return (
    `The user is asking for a ${format.toUpperCase()} file. Call generate_document ` +
    `with format "${format}", a short title, and the full content in markdown. ` +
    `Write the complete content in the tool call — do not repeat it in your reply. ` +
    (format === "xlsx"
      ? "For xlsx, format the content as a markdown table with a header row. "
      : format === "pptx"
      ? "For pptx, start each slide with a '#' or '##' heading. "
      : "") +
    "After the tool returns, tell the user the file is ready and where it was saved."
  );
}

export { detect, promptBlock };
