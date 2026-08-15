// Print stylesheet for generated PDFs, driven by the shared theme so a PDF and
// its companion deck look like one family. Kept separate from pdf.ts so the
// renderer logic stays readable and the design can be tuned on its own.
import { getTheme, type Theme } from "./theme";

const STACKS: Record<string, string> = {
  Cambria: `Cambria, Georgia, "Times New Roman", serif`,
  Calibri: `Calibri, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif`,
  Arial: `Arial, Helvetica, "Helvetica Neue", sans-serif`,
  "Times New Roman": `"Times New Roman", Georgia, serif`,
  "Courier New": `ui-monospace, SFMono-Regular, Menlo, Consolas, "Courier New", monospace`,
};

const stack = (name: string) => STACKS[name] || `${name}, sans-serif`;

export function pdfCss(theme?: Theme | string | null): string {
  const t = typeof theme === "object" && theme ? theme : getTheme(theme as string);
  const p = t.palette;
  const ty = t.type;
  const radius = t.layout.radius;
  return `
  :root {
    --ink: #${p.ink};
    --muted: #${p.inkMuted};
    --rule: #${p.line};
    --accent: #${p.primary};
    --surface: #${p.surface};
    --code-bg: #${p.surfaceAlt};
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font: ${ty.docBody - 0.2}pt/1.6 ${stack(t.fonts.body)};
    color: var(--ink);
    -webkit-font-smoothing: antialiased;
  }

  /* Title block */
  .doc-head { border-bottom: 2px solid var(--accent); padding-bottom: 10px; margin-bottom: 24px; }
  .doc-title {
    font-family: ${stack(t.fonts.heading)};
    font-size: ${ty.docTitle - 7}pt; font-weight: 700; letter-spacing: -0.015em;
    line-height: 1.15; margin: 0; color: var(--accent);
  }
  .doc-meta {
    color: var(--muted); font-size: 8pt; margin-top: 6px;
    text-transform: ${t.layout.uppercaseKicker ? "uppercase" : "none"};
    letter-spacing: 0.08em;
  }

  /* Headings — never stranded at the foot of a page. */
  h1, h2, h3, h4 {
    font-family: ${stack(t.fonts.heading)};
    break-after: avoid; page-break-after: avoid; break-inside: avoid;
  }
  h1 { font-size: ${ty.docH1}pt; font-weight: 700; margin: 1.5em 0 0.45em; line-height: 1.25; letter-spacing: -0.01em; color: var(--accent); }
  h2 { font-size: ${ty.docH2}pt; font-weight: 650; margin: 1.35em 0 0.4em; line-height: 1.3; }
  h3 { font-size: ${ty.docH3}pt; font-weight: 650; margin: 1.15em 0 0.35em; }
  h4, h5, h6 { font-size: ${ty.docH3 - 0.5}pt; font-weight: 650; margin: 1em 0 0.3em; color: var(--muted); }
  h1 + h2, h2 + h3 { margin-top: 0.6em; }

  p { margin: 0.5em 0; orphans: 3; widows: 3; }
  a { color: #${p.secondary}; text-decoration: none; }
  strong { font-weight: 650; }

  ul, ol { margin: 0.5em 0 0.7em; padding-left: 1.35em; }
  li { margin: 0.22em 0; orphans: 2; widows: 2; }
  li::marker { color: #${p.accent}; }

  blockquote {
    margin: 0.8em 0; padding: 0.5em 0.9em;
    background: var(--surface);
    border-left: 3px solid #${p.accent}; color: var(--ink); font-style: italic;
    break-inside: avoid;
  }

  hr { border: 0; border-top: 1px solid var(--rule); margin: 1.4em 0; }

  /* Code must WRAP: a print surface has no horizontal scrollbar, so
     overflow-x would silently clip long lines out of the PDF. */
  pre {
    background: var(--code-bg);
    border: 1px solid var(--rule);
    border-radius: ${radius}px;
    padding: 10px 12px;
    margin: 0.75em 0;
    white-space: pre-wrap;
    word-break: break-word;
    overflow-wrap: anywhere;
    break-inside: avoid;
  }
  code { font-family: ${stack(t.fonts.mono)}; font-size: 9pt; }
  p > code, li > code, td > code {
    background: var(--code-bg); border: 1px solid var(--rule);
    border-radius: 4px; padding: 0.5px 4px;
  }
  pre code { border: 0; background: none; padding: 0; font-size: 8.8pt; line-height: 1.5; }

  table {
    border-collapse: collapse; width: 100%; margin: 0.9em 0;
    font-size: ${ty.docBody - 1.5}pt; table-layout: auto;
  }
  thead { display: table-header-group; }
  tr { break-inside: avoid; }
  th, td {
    padding: 6px 9px; text-align: left; vertical-align: top; word-break: break-word;
    border-bottom: 1px solid var(--rule);
  }
  th {
    background: var(--accent); color: #${p.inkInverse}; font-weight: 650;
    border-bottom: 0;
  }
  tbody tr:nth-child(even) td { background: var(--surface); }

  img { max-width: 100%; height: auto; }
`;
}

/** Back-compat for callers that imported the constant. */
export const PDF_CSS = pdfCss(null);
