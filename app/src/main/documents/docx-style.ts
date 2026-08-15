// Theme → docx-js styles and primitives.
//
// Built-in headings MUST be overridden through `styles.default`. A custom
// paragraph style named "Heading1" is silently ignored by Word and
// LibreOffice, which is why generated documents used to come out with stock
// blue sans headings regardless of the theme.
import {
  AlignmentType, BorderStyle, Footer, LevelFormat, PageNumber, Paragraph,
  ShadingType, Table, TableCell, TableRow, TabStopType, TextRun, WidthType, Tab,
} from "docx";
import type { Theme } from "./theme";

export const DXA_PER_IN = 1440;
export const LETTER = { width: 12240, height: 15840 };
const PAGE_WIDTH_IN = 8.5;

export function styles(t: Theme) {
  const { palette: p, fonts: f, type: ty } = t;
  const h = (size: number, color: string, before: number, after: number) => ({
    run: { font: f.heading, size: size * 2, bold: true, color },
    paragraph: { spacing: { before, after, line: Math.round(size * 1.2 * 20) } },
  });
  return {
    default: {
      document: {
        run: { font: f.body, size: ty.docBody * 2, color: p.ink },
        paragraph: { spacing: { line: 300, after: 140 } },
      },
      title: h(ty.docTitle, p.primary, 60, 160),
      heading1: h(ty.docH1, p.primary, 340, 120),
      heading2: h(ty.docH2, p.ink, 280, 100),
      heading3: h(ty.docH3, p.inkMuted, 240, 80),
    },
    paragraphStyles: [
      {
        id: "Lede", name: "Lede", basedOn: "Normal", next: "Normal",
        run: { font: f.body, size: ty.docH3 * 2, color: p.inkMuted },
        paragraph: { spacing: { after: 240 } },
      },
      {
        id: "CodeLine", name: "CodeLine", basedOn: "Normal", next: "Normal",
        run: { font: f.mono, size: (ty.docBody - 1) * 2, color: p.ink },
        paragraph: { spacing: { after: 40, line: 260 } },
      },
    ],
  };
}

export function sectionProps(t: Theme) {
  const mg = Math.round(t.layout.docMarginIn * DXA_PER_IN);
  return { page: { size: LETTER, margin: { top: mg, right: mg, bottom: mg, left: mg } } };
}

export function numbering(t: Theme) {
  const bullet = (level: number, text: string, left: number) => ({
    level, format: LevelFormat.BULLET, text, alignment: AlignmentType.LEFT,
    style: {
      paragraph: { indent: { left, hanging: 260 } },
      run: { color: t.palette.accent },
    },
  });
  return {
    config: [
      { reference: "ds-bullets", levels: [bullet(0, "•", 460), bullet(1, "◦", 880)] },
      {
        reference: "num",
        levels: [
          {
            level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 460, hanging: 260 } } },
          },
        ],
      },
    ],
  };
}

export function rule(t: Theme) {
  return new Paragraph({
    text: "",
    spacing: { before: 200, after: 200 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: t.palette.line, space: 1 } },
  });
}

export function table(t: Theme, header: string[], rows: string[][]) {
  const p = t.palette;
  const usable = Math.round((PAGE_WIDTH_IN - 2 * t.layout.docMarginIn) * DXA_PER_IN);
  const n = Math.max(header.length, 1);
  const widths = Array(n).fill(Math.floor(usable / n));

  const cellOf = (text: string, i: number, fill: string, bold: boolean, color?: string) =>
    new TableCell({
      width: { size: widths[i], type: WidthType.DXA },
      shading: { type: ShadingType.CLEAR, fill },
      margins: { top: 80, bottom: 80, left: 140, right: 140 },
      children: [
        new Paragraph({
          children: [new TextRun({ text: String(text ?? ""), bold, color, font: t.fonts.body })],
        }),
      ],
    });

  const head = new TableRow({
    tableHeader: true,
    children: header.map((hh, i) => cellOf(hh, i, p.primary, true, p.inkInverse)),
  });
  const body = rows.map(
    (r, ri) =>
      new TableRow({
        children: Array.from({ length: n }, (_, i) =>
          cellOf(r[i] ?? "", i, ri % 2 ? p.surface : "FFFFFF", false)
        ),
      })
  );
  const none = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  return new Table({
    columnWidths: widths,
    width: { size: usable, type: WidthType.DXA },
    borders: {
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: p.line },
      insideVertical: none, top: none, left: none, right: none,
      bottom: { style: BorderStyle.SINGLE, size: 6, color: p.primary },
    },
    rows: [head, ...body],
  });
}

export function footer(t: Theme, label: string) {
  const small = { size: t.type.docCaption * 2, color: t.palette.inkMuted, font: t.fonts.body };
  return new Footer({
    children: [
      new Paragraph({
        tabStops: [
          {
            type: TabStopType.RIGHT,
            position: Math.round((PAGE_WIDTH_IN - 2 * t.layout.docMarginIn) * DXA_PER_IN),
          },
        ],
        border: { top: { style: BorderStyle.SINGLE, size: 2, color: t.palette.line, space: 6 } },
        children: [
          new TextRun({ text: label, ...small }),
          new TextRun({ children: [new Tab(), PageNumber.CURRENT], ...small }),
        ],
      }),
    ],
  });
}
