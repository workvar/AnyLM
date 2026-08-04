// Per-project folder on disk (Documents/AnyLM/Projects/<name> by default).
// Holds generated MD/PDF files and the auto-appended decisions log, and serves
// reads for the in-app viewer. Everything generated is also indexed into the
// project's Chroma memory so it stays retrievable in chats.
import { app, BrowserWindow, shell } from "electron";
import * as fs from "fs";
import * as path from "path";
import * as store from "./store";
import * as chroma from "./chroma";

function defaultBase() {
  return path.join(app.getPath("documents"), "AnyLM", "Projects");
}

function safeName(name) {
  const clean = String(name || "").replace(/[\\/:*?"<>|]/g, "-").trim().slice(0, 80);
  return clean || "project";
}

// Join a custom base directory with a project name (used at creation time).
function childPath(base, name) {
  return path.join(base, safeName(name));
}

// Create (if needed) and persist the folder for a project.
// customPath, when given, becomes the project folder as-is.
function ensureFolder(project: Project | null, customPath?: string | null): string | null {
  if (!project) return null;
  const dir = customPath || project.folderPath || childPath(defaultBase(), project.name);
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (e) {
    console.warn(`[pfiles] mkdir "${dir}" failed: ${e.message}`);
    return null;
  }
  if (project.folderPath !== dir) store.update(project.id, { folderPath: dir });
  return dir;
}

function folderOf(projectId) {
  const p = store.get(projectId);
  return p && p.folderPath ? p.folderPath : null;
}

function listFiles(projectId) {
  const dir = folderOf(projectId);
  if (!dir) return { dir: null, files: [] };
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return { dir, files: [] };
  }
  const files = [];
  for (const e of entries) {
    if (!e.isFile() || e.name.startsWith(".")) continue;
    try {
      const fp = path.join(dir, e.name);
      const st = fs.statSync(fp);
      files.push({
        name: e.name,
        ext: path.extname(e.name).toLowerCase(),
        size: st.size,
        mtime: st.mtime.toISOString(),
      });
    } catch {}
  }
  files.sort((a, b) => b.mtime.localeCompare(a.mtime));
  return { dir, files };
}

// Resolve a filename strictly inside the project folder (no traversal).
function resolveInside(projectId, name) {
  const dir = folderOf(projectId);
  if (!dir) return null;
  const fp = path.resolve(dir, String(name || ""));
  return fp.startsWith(path.resolve(dir) + path.sep) ? fp : null;
}

// Read a file for the in-app viewer. Text formats return content; PDFs return
// a file:// URL rendered by Chromium's built-in viewer.
function readFile(projectId, name) {
  const fp = resolveInside(projectId, name);
  if (!fp || !fs.existsSync(fp)) return null;
  const ext = path.extname(fp).toLowerCase();
  if (ext === ".pdf") {
    return { name: path.basename(fp), ext, url: "file://" + encodeURI(fp).replace(/#/g, "%23") };
  }
  // Binary documents carry no inline content; the viewer uses pfiles:preview.
  if (ext === ".docx" || ext === ".pptx") {
    return { name: path.basename(fp), ext };
  }
  try {
    return { name: path.basename(fp), ext, content: fs.readFileSync(fp, "utf8") };
  } catch {
    return null;
  }
}

// Preview for binary document formats (docx/pptx) shown in the in-app viewer.
async function previewFile(projectId, name) {
  const fp = resolveInside(projectId, name);
  if (!fp || !fs.existsSync(fp)) return { kind: "none" };
  const ext = path.extname(fp).toLowerCase();
  return require("./documents/preview").preview(fp, ext);
}

// First free path for "<title>.<ext>" ("<title> (2).<ext>", …).
function uniquePath(dir, title, ext) {
  const base = safeName(title);
  let fp = path.join(dir, `${base}${ext}`);
  for (let n = 2; fs.existsSync(fp); n++) fp = path.join(dir, `${base} (${n})${ext}`);
  return fp;
}

// Index generated content into the project's Chroma memory (fails soft).
function indexText(projectId, name, text) {
  const chunks = [];
  const body = String(text || "");
  for (let i = 0; i < body.length && chunks.length < 40; i += 1500) {
    chunks.push({
      text: body.slice(i, i + 1500),
      metadata: { projectId, kind: "file", name },
    });
  }
  chroma.addTexts(chroma.PROJECT_MEMORY, chunks).catch(() => {});
}

// Save markdown into the project folder and index it.
function saveMarkdown(projectId, title, markdown) {
  const project = store.get(projectId);
  const dir = ensureFolder(project);
  if (!dir) return null;
  const fp = uniquePath(dir, title || "note", ".md");
  fs.writeFileSync(fp, String(markdown || ""));
  indexText(projectId, path.basename(fp), markdown);
  return path.basename(fp);
}

function pdfDocument(title, bodyHtml) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body { font: 13px/1.6 -apple-system, "Segoe UI", Roboto, sans-serif; color: #1a1a1a; margin: 48px; }
    h1, h2, h3 { line-height: 1.3; }
    pre { background: #f4f4f4; padding: 10px; border-radius: 6px; overflow-x: auto; }
    code { font: 12px/1.5 ui-monospace, Menlo, monospace; }
    .doc-title { font-size: 20px; font-weight: 700; margin-bottom: 4px; }
    .doc-meta { color: #777; font-size: 11px; margin-bottom: 24px; }
  </style></head><body>
    <div class="doc-title">${escapeHtml(title || "Document")}</div>
    <div class="doc-meta">AnyLM · ${new Date().toLocaleString()}</div>
    ${bodyHtml}
  </body></html>`;
}

function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Render HTML to a PDF buffer via a hidden window (no extra dependencies).
async function htmlToPdf(html) {
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
  try {
    await win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html));
    return await win.webContents.printToPDF({ printBackground: true });
  } finally {
    win.destroy();
  }
}

// Save a PDF built from pre-rendered markdown HTML; index the plain text.
async function savePdf(projectId, title, html, text) {
  const project = store.get(projectId);
  const dir = ensureFolder(project);
  if (!dir) return null;
  const buffer = await htmlToPdf(pdfDocument(title, html || ""));
  const fp = uniquePath(dir, title || "document", ".pdf");
  fs.writeFileSync(fp, buffer);
  indexText(projectId, path.basename(fp), text);
  return path.basename(fp);
}

// Reserve a unique save path in the project folder (creating it if needed).
// Used by the document generators for formats written directly to disk.
function savePathFor(projectId, title, ext) {
  const project = store.get(projectId);
  const dir = ensureFolder(project);
  return dir ? uniquePath(dir, title || "document", ext) : null;
}

// Append one completed exchange to the project's running decisions log.
function appendLog(projectId, { userText, assistantText }) {
  const dir = folderOf(projectId);
  if (!dir) return;
  const fp = path.join(dir, "decisions-log.md");
  try {
    if (!fs.existsSync(fp)) {
      fs.writeFileSync(fp, "# Decisions log\n\nEvery exchange in this project, appended automatically by AnyLM.\n");
    }
    const stamp = new Date().toLocaleString();
    fs.appendFileSync(
      fp,
      `\n---\n\n## ${stamp}\n\n**User:** ${userText || ""}\n\n**Assistant:** ${assistantText || ""}\n`
    );
  } catch (e) {
    console.warn(`[pfiles] appendLog failed: ${e.message}`);
  }
}

function reveal(projectId) {
  const dir = folderOf(projectId);
  if (dir) shell.openPath(dir);
  return !!dir;
}

export { defaultBase, childPath, ensureFolder, listFiles, readFile, previewFile, saveMarkdown, savePdf, savePathFor, indexText, appendLog, reveal };

