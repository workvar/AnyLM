// In-app previews for binary document formats.
// docx → HTML via mammoth; pptx → per-slide text extracted with jszip.
import * as fs from "fs";

// mammoth and jszip are only pulled in when a docx/pptx is actually previewed;
// `import type` keeps that lazy while still typing the require() calls.
type Mammoth = typeof import("mammoth");
type JSZipModule = typeof import("jszip");

export type Preview =
  | { kind: "html"; html: string }
  | { kind: "slides"; slides: string[] }
  | { kind: "none" };

function decodeXml(s: string): string {
  return String(s)
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

async function previewDocx(fp: string): Promise<Preview> {
  const mammoth = require("mammoth") as Mammoth;
  const { value } = await mammoth.convertToHtml({ path: fp });
  return { kind: "html", html: value };
}

async function previewPptx(fp: string): Promise<Preview> {
  const JSZip = require("jszip") as JSZipModule;
  const zip = await JSZip.loadAsync(fs.readFileSync(fp));
  const names = Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));
  const slides: string[] = [];
  for (const n of names) {
    const xml = await zip.files[n].async("string");
    // Paragraph boundaries → newlines, then collect text runs.
    const paras = xml.split(/<\/a:p>/).map((p) =>
      [...p.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => decodeXml(m[1])).join("")
    );
    slides.push(paras.filter(Boolean).join("\n"));
  }
  return { kind: "slides", slides };
}

// preview(filePath, ext) → { kind: "html"|"slides"|"none", ... }
async function preview(fp: string, ext: string): Promise<Preview> {
  try {
    if (ext === ".docx") return await previewDocx(fp);
    if (ext === ".pptx") return await previewPptx(fp);
  } catch (e) {
    console.warn(`[docs] preview failed for ${fp}: ${(e as Error).message}`);
  }
  return { kind: "none" };
}

export { preview };

