// Markdown → .xlsx buffer. Written by hand with jszip (already a dependency)
// so the app carries no spreadsheet library.
//
// Input shape: markdown pipe tables become sheet rows. Anything outside a
// table is written as a single-column row so no content is silently dropped.
import JSZip from "jszip";
import { parseRows } from "./parse-table";
import { colsXml, rowStyle, sheetViewXml, stylesXml, XF } from "./xlsx-style";
import { resolveTheme } from "./theme";

function colName(i: number): string {
  let n = i + 1;
  let out = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    out = String.fromCharCode(65 + r) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

// XML escape, minus the control characters Excel rejects outright.
function esc(s: unknown): string {
  return String(s)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function cell(ref: string, value: string, xf: number): string {
  const style = xf ? ` s="${xf}"` : "";
  if (value !== "" && !isNaN(Number(value)) && /^-?\d+(\.\d+)?$/.test(value.trim())) {
    return `<c r="${ref}"${style}><v>${value.trim()}</v></c>`;
  }
  return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${esc(value)}</t></is></c>`;
}

function sheetXml(rows: string[][], headerRow: boolean): string {
  const width = rows.length ? Math.max(...rows.map((r) => r.length)) : 0;
  const body = rows
    .map((cells, r) => {
      const xf = rowStyle(r, headerRow);
      // Pad to the widest row so banding and borders run the full table.
      const inner = Array.from({ length: width }, (_, c) =>
        cell(`${colName(c)}${r + 1}`, cells[c] ?? "", xf)
      ).join("");
      const h = xf === XF.HEADER ? ' ht="22" customHeight="1"' : "";
      return `<row r="${r + 1}"${h}>${inner}</row>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${sheetViewXml(
    headerRow
  )}${colsXml(rows)}<sheetData>${body}</sheetData></worksheet>`;
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

const WORKBOOK_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;



function workbookXml(sheetName: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="${esc(sheetName).slice(0, 31)}" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;
}

async function buildXlsx(
  title: unknown,
  markdown: string,
  themeId?: string | null
): Promise<Buffer> {
  const theme = resolveTheme(title, markdown, themeId);
  const { rows, hasHeader } = parseRows(markdown);
  const zip = new JSZip();
  zip.file("[Content_Types].xml", CONTENT_TYPES);
  zip.file("_rels/.rels", ROOT_RELS);
  zip.file("xl/workbook.xml", workbookXml(String(title || "Sheet1")));
  zip.file("xl/_rels/workbook.xml.rels", WORKBOOK_RELS);
  zip.file("xl/styles.xml", stylesXml(theme));
  zip.file("xl/worksheets/sheet1.xml", sheetXml(rows, hasHeader));
  return zip.generateAsync({ type: "nodebuffer" });
}

export { buildXlsx };
