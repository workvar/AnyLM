// Document generation entry point for the generate_document tool.
// All output lands in the project's storage folder and is indexed into the
// project's Chroma memory. Callers gate this behind explicit user approval.
import * as fs from "fs";
import * as path from "path";
import * as pfiles from "../project-files";
import { mdToHtml } from "./md-html";
import { buildDocx } from "./docx";
import { buildPptx } from "./pptx";

const FORMATS = new Set(["pdf", "docx", "pptx", "md"]);
const NO_FOLDER = "no storage folder is set for this project (Settings → Storage folder)";

// generate(projectId, { format, title, content }) → { name, ext }
interface GenerateOpts {
  format?: string;
  title?: string;
  content?: string;
}

async function generate(
  projectId: string,
  { format, title, content }: GenerateOpts = {}
): Promise<GeneratedFile> {
  const fmt = String(format || "").toLowerCase().trim();
  if (!FORMATS.has(fmt)) {
    throw new Error(`unsupported format "${format}" — use pdf, docx, pptx, or md`);
  }
  const text = String(content || "");
  let name = null;

  if (fmt === "md") {
    name = pfiles.saveMarkdown(projectId, title, text);
  } else if (fmt === "pdf") {
    name = await pfiles.savePdf(projectId, title, mdToHtml(text), text);
  } else {
    const fp = pfiles.savePathFor(projectId, title, `.${fmt}`);
    if (!fp) throw new Error(NO_FOLDER);
    if (fmt === "docx") fs.writeFileSync(fp, await buildDocx(title, text));
    else await buildPptx(title, text, fp);
    pfiles.indexText(projectId, path.basename(fp), text);
    name = path.basename(fp);
  }

  if (!name) throw new Error(NO_FOLDER);
  return { name, ext: `.${fmt}` };
}

export { generate };

