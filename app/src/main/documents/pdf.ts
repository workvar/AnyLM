// Markdown-HTML → PDF buffer, rendered by a hidden Chromium window so the
// app carries no PDF dependency.
import { BrowserWindow } from "electron";

function escapeHtml(s: unknown): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function document(title: unknown, bodyHtml: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body {
      font: 14px/1.65 -apple-system, "Segoe UI", Roboto, sans-serif;
      color: #1a1a1a;
      margin: 56px 64px;
      max-width: 720px;
    }
    h1 { font-size: 22px; font-weight: 700; margin: 1.6em 0 0.5em; line-height: 1.25; }
    h2 { font-size: 17px; font-weight: 650; margin: 1.4em 0 0.45em; line-height: 1.3; }
    h3 { font-size: 14px; font-weight: 650; margin: 1.2em 0 0.4em; line-height: 1.35; }
    p { margin: 0.55em 0; }
    ul, ol { margin: 0.5em 0 0.5em 1.25em; padding: 0; }
    li { margin: 0.25em 0; }
    pre {
      background: #f3f4f6;
      border: 1px solid #e5e7eb;
      padding: 12px 14px;
      border-radius: 8px;
      overflow-x: auto;
      margin: 0.75em 0;
    }
    code { font: 12.5px/1.5 ui-monospace, Menlo, monospace; }
    pre code { font-size: 12px; }
    table { border-collapse: collapse; width: 100%; margin: 12px 0; }
    th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; }
    .doc-title { font-size: 26px; font-weight: 750; margin: 0 0 6px; line-height: 1.2; }
    .doc-meta { color: #6b7280; font-size: 11.5px; margin-bottom: 28px; letter-spacing: 0.01em; }
  </style></head><body>
    <div class="doc-title">${escapeHtml(title || "Document")}</div>
    <div class="doc-meta">AnyLM · ${new Date().toLocaleString()}</div>
    ${bodyHtml}
  </body></html>`;
}

async function buildPdf(title: unknown, bodyHtml: string): Promise<Buffer> {
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
  try {
    const html = document(title, bodyHtml || "");
    await win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html));
    return await win.webContents.printToPDF({ printBackground: true });
  } finally {
    win.destroy();
  }
}

export { buildPdf };
