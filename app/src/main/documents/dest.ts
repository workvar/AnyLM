// Where a generated document is written, and how it is indexed afterwards.
// Project chats write into the project's storage folder; standalone chats fall
// back to Documents/AnyLM/Documents so "make me a PDF" works outside a project.
import { app } from "electron";
import * as fs from "fs";
import * as path from "path";
import * as store from "../store";
import * as chroma from "../chroma";
import * as vectorstore from "../vectorstore";
import { ensureFolder } from "../project-files";

function fallbackDir(): string {
  return path.join(app.getPath("documents"), "AnyLM", "Documents");
}

function safeName(name: unknown): string {
  const clean = String(name || "").replace(/[\\/:*?"<>|]/g, "-").trim().slice(0, 80);
  return clean || "document";
}

// First free path for "<title><ext>" ("<title> (2)<ext>", …).
function uniquePath(dir: string, title: unknown, ext: string): string {
  const base = safeName(title);
  let fp = path.join(dir, `${base}${ext}`);
  for (let n = 2; fs.existsSync(fp); n++) fp = path.join(dir, `${base} (${n})${ext}`);
  return fp;
}

// Reserve a writable path for a generated file. Throws only if no directory
// can be created at all, which is the one failure the model should report.
function reserve(projectId: string | null, title: unknown, ext: string): string {
  let dir: string | null = null;
  if (projectId) dir = ensureFolder(store.get(projectId));
  if (!dir) {
    dir = fallbackDir();
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (e) {
      throw new Error(`could not create an output folder: ${(e as Error).message}`);
    }
  }
  return uniquePath(dir, title, ext);
}

// Make the generated text retrievable later: project memory inside a project,
// the general knowledge base otherwise. Fails soft.
function index(projectId: string | null, name: string, text: unknown): void {
  const body = String(text || "");
  if (!body.trim()) return;
  if (!projectId) {
    vectorstore.add([{ text: body, source: `document:${name}` }]).catch(() => {});
    return;
  }
  const chunks = [];
  for (let i = 0; i < body.length && chunks.length < 40; i += 1500) {
    chunks.push({
      text: body.slice(i, i + 1500),
      metadata: { projectId, kind: "file", name },
    });
  }
  chroma.addTexts(chroma.PROJECT_MEMORY, chunks).catch(() => {});
}

export { fallbackDir, reserve, uniquePath, index };
