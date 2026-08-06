// Markdown → .docx buffer via the `docx` package.
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from "docx";
import { parseBlocks } from "./parse-md";

const HEADINGS = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6,
];

function toParagraphs(blocks) {
  const out = [];
  for (const b of blocks) {
    if (b.kind === "heading") {
      out.push(new Paragraph({ text: b.text, heading: HEADINGS[b.level - 1] }));
    } else if (b.kind === "bullet") {
      out.push(new Paragraph({ text: b.text, bullet: { level: 0 } }));
    } else if (b.kind === "numbered") {
      out.push(new Paragraph({ text: b.text, numbering: { reference: "num", level: 0 } }));
    } else if (b.kind === "code") {
      for (const line of b.text.split("\n")) {
        out.push(
          new Paragraph({ children: [new TextRun({ text: line, font: "Courier New", size: 18 })] })
        );
      }
    } else {
      out.push(new Paragraph({ text: b.text }));
    }
  }
  return out;
}

async function buildDocx(title, markdown) {
  const doc = new Document({
    numbering: {
      config: [
        {
          reference: "num",
          levels: [{ level: 0, format: "decimal", text: "%1.", alignment: "left" }],
        },
      ],
    },
    sections: [
      {
        children: [
          new Paragraph({ text: String(title || "Document"), heading: HeadingLevel.TITLE }),
          ...toParagraphs(parseBlocks(markdown)),
        ],
      },
    ],
  });
  return Packer.toBuffer(doc);
}

export { buildDocx };

