// Tool arguments are model output, not an API contract. Small local models
// routinely send `format: "Presentation"` and a `content` ARRAY of slide
// objects instead of a markdown string — which used to reach the builders as
// the literal text "[object Object],[object Object]".
//
// Everything here is lenient on the way in and strict on the way out: the rest
// of the pipeline still only ever sees a known format and a markdown string.

const FORMAT_ALIASES: Record<string, string> = {
  pdf: "pdf",
  docx: "docx", doc: "docx", word: "docx", "word document": "docx",
  document: "docx", report: "docx", letter: "docx", memo: "docx",
  pptx: "pptx", ppt: "pptx", powerpoint: "pptx", presentation: "pptx",
  slides: "pptx", slide: "pptx", deck: "pptx", slideshow: "pptx",
  xlsx: "xlsx", xls: "xlsx", excel: "xlsx", spreadsheet: "xlsx",
  sheet: "xlsx", workbook: "xlsx", csv: "xlsx",
  md: "md", markdown: "md", text: "md", txt: "md",
};

const KNOWN = new Set(["pdf", "docx", "pptx", "xlsx", "md"]);

/** Keys models use for a slide/section heading, in preference order. */
const TITLE_KEYS = ["title", "heading", "header", "name", "slide_title", "slideTitle", "subject"];
/** Keys whose value is body content. */
const BODY_KEYS = ["content", "body", "text", "description", "paragraph", "details", "notes"];
/** Keys whose value is a list of points. */
const LIST_KEYS = ["bullets", "points", "items", "bullet_points", "bulletPoints", "lines"];
/** Keys whose value is a nested list of slides/sections. */
const CHILD_KEYS = ["slides", "sections", "pages", "chapters", "children"];

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function firstKey(obj: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) if (obj[k] != null && obj[k] !== "") return obj[k];
  return undefined;
}

// A JSON blob arriving as a string is still structured content.
function maybeJson(s: string): unknown {
  const t = s.trim();
  if (!(t.startsWith("[") || t.startsWith("{"))) return null;
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
}

function listToMarkdown(value: unknown): string {
  const items = Array.isArray(value) ? value : [value];
  return items
    .map((i) => (isPlainObject(i) ? objectToMarkdown(i, 3) : String(i ?? "").trim()))
    .filter(Boolean)
    .map((line) => (line.startsWith("#") || line.startsWith("-") ? line : `- ${line}`))
    .join("\n");
}

function bodyToMarkdown(value: unknown): string {
  if (Array.isArray(value)) return listToMarkdown(value);
  if (isPlainObject(value)) return objectToMarkdown(value, 3);
  return String(value ?? "").trim();
}

// One slide/section object → a markdown block.
function objectToMarkdown(obj: Record<string, unknown>, level = 2): string {
  const parts: string[] = [];
  const title = firstKey(obj, TITLE_KEYS);
  if (title != null) parts.push(`${"#".repeat(Math.min(level, 6))} ${String(title).trim()}`);

  const body = firstKey(obj, BODY_KEYS);
  if (body != null) {
    const md = bodyToMarkdown(body);
    if (md) parts.push(md);
  }

  const list = firstKey(obj, LIST_KEYS);
  if (list != null) {
    const md = listToMarkdown(list);
    if (md) parts.push(md);
  }

  const children = firstKey(obj, CHILD_KEYS);
  if (Array.isArray(children)) {
    for (const c of children) {
      parts.push(isPlainObject(c) ? objectToMarkdown(c, level + 1) : String(c ?? ""));
    }
  }

  // Nothing recognised: keep the data rather than dropping it, as "Key: value".
  if (!parts.length) {
    for (const [k, v] of Object.entries(obj)) {
      if (v == null || isPlainObject(v) || Array.isArray(v)) continue;
      parts.push(`- ${k}: ${String(v)}`);
    }
  }
  return parts.filter(Boolean).join("\n\n");
}

/** Anything the model might send as `content` → markdown. */
export function toMarkdown(content: unknown): string {
  if (content == null) return "";
  if (typeof content === "string") {
    const parsed = maybeJson(content);
    return parsed == null ? content : toMarkdown(parsed);
  }
  if (Array.isArray(content)) {
    return content
      .map((c) => (isPlainObject(c) ? objectToMarkdown(c) : String(c ?? "")))
      .filter(Boolean)
      .join("\n\n");
  }
  if (isPlainObject(content)) return objectToMarkdown(content, 1);
  return String(content);
}

/** True when the content looks like slides rather than a prose document. */
function looksLikeSlides(content: unknown): boolean {
  const v = typeof content === "string" ? maybeJson(content) : content;
  if (Array.isArray(v)) return v.length > 1 && v.every(isPlainObject);
  if (isPlainObject(v)) return Array.isArray(v.slides);
  return false;
}

/**
 * Resolve the output format from whatever the model sent. Falls back to the
 * title's extension, then to the shape of the content, so a missing or
 * invented format never costs the user a whole generation.
 */
export function normalizeFormat(format: unknown, title?: unknown, content?: unknown): string {
  const raw = String(format ?? "").toLowerCase().trim().replace(/^\./, "");
  if (KNOWN.has(raw)) return raw;
  if (FORMAT_ALIASES[raw]) return FORMAT_ALIASES[raw];

  const word = raw.split(/[^a-z]+/).find((w) => FORMAT_ALIASES[w]);
  if (word) return FORMAT_ALIASES[word];

  const ext = String(title ?? "").toLowerCase().match(/\.(pdf|docx?|pptx?|xlsx?|md)$/);
  if (ext) return FORMAT_ALIASES[ext[1]] || "pdf";

  if (looksLikeSlides(content)) return "pptx";
  return "pdf";
}
