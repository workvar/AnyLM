// Markdown → .pptx via pptxgenjs, themed. Headings drive slide breaks;
// pptx-layout decides each slide's shape and pptx-render draws it.
import PptxGenJS from "pptxgenjs";
import { parseBlocks } from "./parse-md";
import { toSlides, type SlideSpec } from "./pptx-layout";
import { resolveTheme, type Theme } from "./theme";
import * as R from "./pptx-render";

function renderSlide(pptx: any, t: Theme, spec: SlideSpec, label: string, page: number): boolean {
  if (spec.kind === "cover") {
    R.coverSlide(pptx, t, spec.title, spec.subtitle);
    return false; // cover carries no footer
  }
  if (spec.kind === "section" || (spec.kind === "closing" && spec.bodyKind === "prose" && !spec.prose?.length)) {
    R.sectionSlide(pptx, t, spec.title, spec.kicker);
    return false;
  }

  const { slide, top } = R.contentSlide(pptx, t, spec.title, spec.kicker);
  let y = top;
  if (spec.lede) y = R.lede(slide, t, spec.lede, y);

  if (spec.bodyKind === "table" && spec.table) {
    R.table(slide, t, spec.table.header, spec.table.rows, y);
  } else if (spec.bodyKind === "cards" && spec.cards) {
    R.cardGrid(slide, t, spec.cards, y);
  } else if (spec.bodyKind === "pillars" && spec.pillars) {
    R.pillarGrid(slide, t, spec.pillars, y);
  } else if (spec.bodyKind === "bullets" && spec.bullets?.length) {
    R.bulletList(slide, t, spec.bullets, y);
  } else if (spec.prose?.length) {
    R.prose(slide, t, spec.prose, y);
  }
  R.footer(slide, t, label, page);
  return true;
}

async function buildPptx(
  title: unknown,
  markdown: string,
  filePath: string,
  themeId?: string | null
): Promise<void> {
  const theme = resolveTheme(title, markdown, themeId);
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "WIDE", width: R.W, height: R.H });
  pptx.layout = "WIDE";
  pptx.theme = { headFontFace: theme.fonts.heading, bodyFontFace: theme.fonts.body };

  const label = String(title || "Presentation");
  const specs = toSlides(title, parseBlocks(markdown));
  let page = 1;
  for (const spec of specs) {
    renderSlide(pptx, theme, spec, label, page);
    page++;
  }
  await pptx.writeFile({ fileName: filePath });
}

export { buildPptx };
