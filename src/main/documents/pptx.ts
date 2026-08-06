// Markdown → .pptx via pptxgenjs. Each '#'/'##' heading starts a new slide;
// list items and paragraphs become bullets on the current slide.
import PptxGenJS from "pptxgenjs";
import { parseBlocks } from "./parse-md";

// Group blocks into slides: { title, lines: [{text, bullet}] }.
function toSlides(title, blocks) {
  const slides = [];
  let cur = null;
  const ensure = () => {
    if (!cur) {
      cur = { title: String(title || "Presentation"), lines: [] };
      slides.push(cur);
    }
    return cur;
  };
  for (const b of blocks) {
    if (b.kind === "heading" && b.level <= 2) {
      cur = { title: b.text, lines: [] };
      slides.push(cur);
    } else if (b.kind === "code") {
      for (const line of b.text.split("\n")) ensure().lines.push({ text: line, bullet: false });
    } else {
      ensure().lines.push({
        text: b.text,
        bullet: b.kind === "bullet" || b.kind === "numbered",
      });
    }
  }
  return slides.length ? slides : [{ title: String(title || "Presentation"), lines: [] }];
}

async function buildPptx(title, markdown, filePath) {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "WIDE", width: 13.33, height: 7.5 });
  pptx.layout = "WIDE";

  for (const s of toSlides(title, parseBlocks(markdown))) {
    const slide = pptx.addSlide();
    slide.addText(s.title, { x: 0.6, y: 0.4, w: 12.1, h: 0.9, fontSize: 28, bold: true });
    if (s.lines.length) {
      slide.addText(
        s.lines.map((l) => ({
          text: l.text,
          options: { bullet: l.bullet, breakLine: true, fontSize: 16 },
        })),
        { x: 0.8, y: 1.5, w: 11.7, h: 5.4, valign: "top" }
      );
    }
  }
  await pptx.writeFile({ fileName: filePath });
}

export { buildPptx };

