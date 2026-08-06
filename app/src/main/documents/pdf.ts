// Markdown-HTML → PDF buffer, rendered by a hidden Chromium window so the
// app carries no PDF dependency.
import { BrowserWindow } from "electron";

function escapeHtml(s: unknown): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function document(title: unknown, bodyHtml: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body { font: 13px/1.6 -apple-system, "Segoe UI", Roboto, sans-serif; color: #1a1a1a; margin: 48px; }
    h1, h2, h3 { line-height: 1.3; }
    pre { background: #f4f4f4; padding: 10px; border-radius: 6px; overflow-x: auto; }
    code { font: 12px/1.5 ui-monospace, Menlo, monospace; }
    table { border-collapse: collapse; width: 100%; margin: 12px 0; }
    th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; }
    .doc-title { font-size: 20px; font-weight: 700; margin-bottom: 4px; }
    .doc-meta { color: #777; font-size: 11px; margin-bottom: 24px; }
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
