// Theme → the styles.xml / cols / sheetView fragments the hand-rolled
// spreadsheet writer needs. Excel is strict about ordering here: fill 0 must
// be "none" and fill 1 must be "gray125", so themed fills start at index 2.
import type { Theme } from "./theme";

/** Cell format indices written into `s="…"`. */
export const XF = { BODY: 0, HEADER: 1, BAND: 2, PLAIN: 3 } as const;

export function stylesXml(t: Theme): string {
  const p = t.palette;
  const f = t.fonts.body;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2">
<font><sz val="11"/><name val="${f}"/><color rgb="FF${p.ink}"/></font>
<font><b/><sz val="11"/><name val="${f}"/><color rgb="FF${p.inkInverse}"/></font>
</fonts>
<fills count="4">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF${p.primaryLight}"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF${p.surface}"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="3">
<border/>
<border><bottom style="thin"><color rgb="FF${p.line}"/></bottom></border>
<border><bottom style="medium"><color rgb="FF${p.primary}"/></bottom></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="4">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
</cellXfs>
</styleSheet>`;
}

// Width from the widest cell, clamped so one long sentence cannot blow out a
// column. Long single-column dumps are capped harder than real table columns.
export function colsXml(rows: string[][]): string {
  if (!rows.length) return "";
  const width = Math.max(...rows.map((r) => r.length));
  const cap = width === 1 ? 90 : 40;
  const cols: string[] = [];
  for (let c = 0; c < width; c++) {
    const longest = rows.reduce((n, r) => Math.max(n, String(r[c] ?? "").length), 0);
    const w = Math.max(10, Math.min(cap, longest + 4));
    cols.push(`<col min="${c + 1}" max="${c + 1}" width="${w}" customWidth="1"/>`);
  }
  return `<cols>${cols.join("")}</cols>`;
}

// Gridlines off and the header frozen — the two changes that make a generated
// sheet read as designed rather than dumped.
export function sheetViewXml(hasHeader: boolean): string {
  const pane = hasHeader
    ? `<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>` +
      `<selection pane="bottomLeft" activeCell="A2" sqref="A2"/>`
    : "";
  return `<sheetViews><sheetView workbookViewId="0" showGridLines="0" zoomScale="110">${pane}</sheetView></sheetViews>`;
}

export function rowStyle(rowIndex: number, hasHeader: boolean): number {
  if (hasHeader && rowIndex === 0) return XF.HEADER;
  const body = hasHeader ? rowIndex - 1 : rowIndex;
  return body % 2 === 1 ? XF.BAND : XF.PLAIN;
}
