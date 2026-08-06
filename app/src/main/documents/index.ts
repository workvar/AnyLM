// Document generation entry point for the generate_document tool.
// Output lands in the project's storage folder, or in Documents/AnyLM/Documents
// for chats outside a project, and is indexed so it stays retrievable.
import * as fs from "fs";
import * as path from "path";
import * as dest from "./dest";
import { mdToHtml } from "./md-html";
import { buildDocx } from "./docx";
import { buildPptx } from "./pptx";
import { buildXlsx } from "./xlsx";
import { buildPdf } from "./pdf";

const FORMATS = new Set(["pdf", "docx", "pptx", "xlsx", "md"]);

interface GenerateOpts {
  format?: string;
  title?: string;
  content?: string;
}

// generate(projectId, { format, title, content }) → { name, ext, dir }
async function generate(
  projectId: string | null,
  { format, title, content }: GenerateOpts = {}
): Promise<GeneratedFile> {
  const fmt = String(format || "").toLowerCase().trim();
  if (!FORMATS.has(fmt)) {
    throw new Error(`unsupported format "${format}" — use pdf, docx, pptx, xlsx, or md`);
  }
  const text = String(content || "");
  const fp = dest.reserve(projectId, title || "document", `.${fmt}`);

  if (fmt === "md") fs.writeFileSync(fp, text);
  else if (fmt === "pdf") fs.writeFileSync(fp, await buildPdf(title, mdToHtml(text)));
  else if (fmt === "docx") fs.writeFileSync(fp, await buildDocx(title, text));
  else if (fmt === "xlsx") fs.writeFileSync(fp, await buildXlsx(title, text));
  else await buildPptx(title, text, fp);

  const name = path.basename(fp);
  dest.index(projectId, name, text);
  return { name, ext: `.${fmt}`, dir: path.dirname(fp) };
}

export { generate };
