// Markdown → .docx buffer via the `docx` package, themed.
import { Document, HeadingLevel, Packer, Paragraph } from "docx";
import { parseBlocks } from "./parse-md";
import * as S from "./docx-style";
import { resolveTheme, type Theme } from "./theme";

const HEADINGS = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6,
];

const norm = (s: unknown) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");

// The markdown usually repeats the title as its first heading. Printing both
// gives every document a stutter at the top.
function dropEchoedTitle(title: unknown, blocks: any[]): any[] {
  const first = blocks[0];
  if (first && first.kind === "heading" && first.level === 1 && norm(first.text) === norm(title)) {
    return blocks.slice(1);
  }
  return blocks;
}

function toParagraphs(t: Theme, blocks: any[]): any[] {
  const out: any[] = [];
  // Only the opening paragraph gets the lede treatment. Applying it after every
  // heading would render most of the document in muted grey.
  let first = true;
  for (const b of blocks) {
    if (b.kind === "heading") {
      out.push(new Paragraph({ text: b.text, heading: HEADINGS[b.level - 1] }));
    } else if (b.kind === "table") {
      out.push(S.table(t, b.header, b.rows));
      out.push(new Paragraph({ text: "" }));
    } else if (b.kind === "bullet") {
      out.push(new Paragraph({ text: b.text, numbering: { reference: "ds-bullets", level: 0 } }));
    } else if (b.kind === "numbered") {
      out.push(new Paragraph({ text: b.text, numbering: { reference: "num", level: 0 } }));
    } else if (b.kind === "code") {
      for (const line of String(b.text).split("\n")) {
        out.push(new Paragraph({ text: line, style: "CodeLine" }));
      }
    } else {
      // The opening paragraph sets up the document; give it the lede treatment.
      out.push(new Paragraph({ text: b.text, style: first ? "Lede" : undefined }));
      first = false;
    }
  }
  return out;
}

async function buildDocx(title: unknown, markdown: string, themeId?: string | null): Promise<Buffer> {
  const t = resolveTheme(title, markdown, themeId);
  const label = String(title || "Document");
  const doc = new Document({
    styles: S.styles(t) as any,
    numbering: S.numbering(t) as any,
    sections: [
      {
        properties: S.sectionProps(t),
        footers: { default: S.footer(t, label) },
        children: [
          new Paragraph({ text: label, heading: HeadingLevel.TITLE }),
          S.rule(t),
          ...toParagraphs(t, dropEchoedTitle(label, parseBlocks(markdown))),
        ],
      },
    ],
  });
  return Packer.toBuffer(doc);
}

export { buildDocx };
