// Document generation entry point for the generate_document tool.
// Output lands in the project's storage folder, or in the generated-files folder
// for chats outside a project, and is indexed so it stays retrievable.
import * as fs from "fs";
import * as path from "path";
import * as dest from "./dest";
import { mdToHtml } from "./md-html";
import { buildDocx } from "./docx";
import { buildPptx } from "./pptx";
import { buildXlsx } from "./xlsx";
import { buildPdf } from "./pdf";
import { assertDocumentContentOrThrow } from "./content-quality";
import { resolveTheme } from "./theme";
import { normalizeFormat, toMarkdown } from "./normalize";

const FORMATS = new Set(["pdf", "docx", "pptx", "xlsx", "md"]);

interface GenerateOpts {
  format?: string;
  title?: string;
  content?: string;
  /** "professional" | "academic" | "vibrant" | "informal". Omit to detect from the content. */
  theme?: string;
}

// generate(projectId, { format, title, content }) → { name, ext, dir }
async function generate(
  projectId: string | null,
  { format, title, content, theme }: GenerateOpts = {}
): Promise<GeneratedFile> {
  // Models send "Presentation" for format and an array of slide objects for
  // content often enough that rejecting those is a worse failure than coercing
  // them: the user sees "unsupported format" or a slide reading [object Object].
  const fmt = normalizeFormat(format, title, content);
  if (!FORMATS.has(fmt)) {
    throw new Error(`unsupported format "${format}" — use pdf, docx, pptx, xlsx, or md`);
  }
  const text = toMarkdown(content);
  assertDocumentContentOrThrow(fmt, text);
  const fp = dest.reserve(projectId, title || "document", `.${fmt}`);
  // One theme for the whole file, resolved from the content when not given, so
  // every format of the same document comes out looking like one family.
  const themeId = resolveTheme(title, text, theme).id;

  if (fmt === "md") fs.writeFileSync(fp, text);
  else if (fmt === "pdf") fs.writeFileSync(fp, await buildPdf(title, mdToHtml(text), themeId));
  else if (fmt === "docx") fs.writeFileSync(fp, await buildDocx(title, text, themeId));
  else if (fmt === "xlsx") fs.writeFileSync(fp, await buildXlsx(title, text, themeId));
  else await buildPptx(title, text, fp, themeId);

  const name = path.basename(fp);
  dest.index(projectId, name, text);
  return { name, ext: `.${fmt}`, dir: path.dirname(fp) };
}

export { generate };
