// Markdown-HTML → PDF buffer, rendered by a hidden Chromium window so the
// app carries no PDF dependency.
//
// The HTML goes through a temp FILE, not a data: URL. A data: URL is capped
// by Chromium's URL length limit, so any document past a few pages used to
// load as a blank page and print as an empty PDF.
import { BrowserWindow } from "electron";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { pdfCss } from "./pdf-css";
import { getTheme, type Theme } from "./theme";

function escapeHtml(s: unknown): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formattedDate(): string {
  return new Date().toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function document(title: unknown, bodyHtml: string, theme: Theme): string {
  const heading = escapeHtml(title || "Document");
  return `<!doctype html><html><head><meta charset="utf-8">
    <title>${heading}</title>
    <style>${pdfCss(theme)}</style></head><body>
    <header class="doc-head">
      <h1 class="doc-title">${heading}</h1>
      <div class="doc-meta">AnyLM · ${escapeHtml(formattedDate())}</div>
    </header>
    <main>${bodyHtml}</main>
  </body></html>`;
}

// Page numbers, drawn by Chromium in the bottom margin.
function footerTemplate(title: unknown): string {
  return `<div style="width:100%;font:8pt -apple-system,sans-serif;color:#9aa1ab;
    padding:0 0.75in;display:flex;justify-content:space-between;">
    <span>${escapeHtml(title || "Document")}</span>
    <span><span class="pageNumber"></span> / <span class="totalPages"></span></span>
  </div>`;
}

function writeTempHtml(html: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "anylm-pdf-"));
  const fp = path.join(dir, "document.html");
  fs.writeFileSync(fp, html, "utf8");
  return fp;
}

function removeQuietly(fp: string): void {
  try {
    fs.rmSync(path.dirname(fp), { recursive: true, force: true });
  } catch {
    // temp cleanup is best effort
  }
}

async function buildPdf(
  title: unknown,
  bodyHtml: string,
  themeId?: string | null
): Promise<Buffer> {
  const theme = getTheme(themeId);
  const body = String(bodyHtml || "").trim();
  if (!body) {
    throw new Error("no content to render — pass full markdown in `content`");
  }
  const file = writeTempHtml(document(title, body, theme));
  const win = new BrowserWindow({
    show: false,
    width: 1024,
    height: 1400,
    webPreferences: { sandbox: true, javascript: false },
  });
  try {
    await win.loadFile(file);
    // Layout and webfont metrics must settle before printing, otherwise the
    // first page can be captured mid-layout.
    await new Promise((r) => setTimeout(r, 120));
    const pdf = await win.webContents.printToPDF({
      pageSize: "A4",
      printBackground: true,
      margins: { top: 0.7, bottom: 0.75, left: 0.75, right: 0.75 },
      displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      footerTemplate: footerTemplate(title),
      generateDocumentOutline: true,
    });
    if (!pdf || pdf.length < 1000) throw new Error("PDF renderer produced an empty file");
    return pdf;
  } finally {
    if (!win.isDestroyed()) win.destroy();
    removeQuietly(file);
  }
}

export { buildPdf };
