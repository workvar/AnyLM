// Print stylesheet for generated PDFs. Kept separate from pdf.ts so the
// renderer logic stays readable and the design can be tuned on its own.

export const PDF_CSS = `
  :root {
    --ink: #14161a;
    --muted: #6b7280;
    --rule: #e3e6ea;
    --accent: #2f5cff;
    --code-bg: #f6f7f9;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font: 10.8pt/1.6 -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
    color: var(--ink);
    -webkit-font-smoothing: antialiased;
  }

  /* Title block */
  .doc-head { border-bottom: 2px solid var(--accent); padding-bottom: 10px; margin-bottom: 24px; }
  .doc-title { font-size: 23pt; font-weight: 700; letter-spacing: -0.015em; line-height: 1.15; margin: 0; }
  .doc-meta { color: var(--muted); font-size: 8pt; margin-top: 6px; text-transform: uppercase; letter-spacing: 0.08em; }

  /* Headings — never stranded at the foot of a page. */
  h1, h2, h3, h4 { break-after: avoid; page-break-after: avoid; break-inside: avoid; }
  h1 { font-size: 16pt; font-weight: 700; margin: 1.5em 0 0.45em; line-height: 1.25; letter-spacing: -0.01em; }
  h2 { font-size: 13pt; font-weight: 650; margin: 1.35em 0 0.4em; line-height: 1.3; }
  h3 { font-size: 11pt; font-weight: 650; margin: 1.15em 0 0.35em; }
  h4, h5, h6 { font-size: 10.5pt; font-weight: 650; margin: 1em 0 0.3em; color: #33383f; }
  h1 + h2, h2 + h3 { margin-top: 0.6em; }

  p { margin: 0.5em 0; orphans: 3; widows: 3; }
  a { color: var(--accent); text-decoration: none; }
  strong { font-weight: 650; }

  ul, ol { margin: 0.5em 0 0.7em; padding-left: 1.35em; }
  li { margin: 0.22em 0; orphans: 2; widows: 2; }
  li::marker { color: var(--muted); }

  blockquote {
    margin: 0.8em 0; padding: 0.35em 0 0.35em 14px;
    border-left: 3px solid var(--rule); color: #3c424a; font-style: italic;
    break-inside: avoid;
  }

  hr { border: 0; border-top: 1px solid var(--rule); margin: 1.4em 0; }

  /* Code must WRAP: a print surface has no horizontal scrollbar, so
     overflow-x would silently clip long lines out of the PDF. */
  pre {
    background: var(--code-bg);
    border: 1px solid var(--rule);
    border-radius: 6px;
    padding: 10px 12px;
    margin: 0.75em 0;
    white-space: pre-wrap;
    word-break: break-word;
    overflow-wrap: anywhere;
    break-inside: avoid;
  }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 9pt; }
  p > code, li > code, td > code {
    background: var(--code-bg); border: 1px solid var(--rule);
    border-radius: 4px; padding: 0.5px 4px;
  }
  pre code { border: 0; background: none; padding: 0; font-size: 8.8pt; line-height: 1.5; }

  table {
    border-collapse: collapse; width: 100%; margin: 0.9em 0;
    font-size: 9.5pt; table-layout: auto;
  }
  thead { display: table-header-group; }
  tr { break-inside: avoid; }
  th, td {
    border: 1px solid var(--rule); padding: 6px 9px;
    text-align: left; vertical-align: top; word-break: break-word;
  }
  th { background: #f2f4f7; font-weight: 650; }
  tbody tr:nth-child(even) td { background: #fafbfc; }

  img { max-width: 100%; height: auto; }
`;
