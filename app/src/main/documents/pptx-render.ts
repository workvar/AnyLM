// Themed slide primitives for pptxgenjs. Canvas is 13.33 x 7.5in.
import { inkOn, type Theme } from "./theme";
import type { Card } from "./pptx-layout";

export const W = 13.33;
export const H = 7.5;

export const margin = (t: Theme) => t.layout.slideMarginIn;

const kickerText = (t: Theme, s: string) => (t.layout.uppercaseKicker ? s.toUpperCase() : s);

export function coverSlide(pptx: any, t: Theme, title: string, subtitle?: string) {
  const p = t.palette;
  const bg = t.layout.darkCover ? p.primary : p.surface;
  const s = pptx.addSlide();
  s.background = { color: bg };
  const ink = inkOn(bg, t);
  const muted = ink === p.ink ? p.inkMuted : p.surfaceAlt;
  const m = margin(t);
  s.addText(title, {
    x: m, y: 2.3, w: W - 2 * m - 1.2, h: 1.7, margin: 0, valign: "bottom",
    fontFace: t.fonts.heading, fontSize: t.type.deckTitle, bold: true, color: ink,
  });
  if (subtitle) {
    s.addText(subtitle, {
      x: m, y: 4.1, w: W - 2 * m - 1.2, h: 0.8, margin: 0,
      fontFace: t.fonts.body, fontSize: t.type.deckSubtitle, color: muted,
    });
  }
  return s;
}

export function sectionSlide(pptx: any, t: Theme, title: string, kicker?: string) {
  const p = t.palette;
  const m = margin(t);
  const s = pptx.addSlide();
  s.background = { color: p.primary };
  if (kicker) {
    s.addText(kickerText(t, kicker), {
      x: m, y: 2.9, w: W - 2 * m, h: 0.4, margin: 0, fontFace: t.fonts.body,
      fontSize: t.type.slideKicker, bold: true, color: p.accentOnDark,
      charSpacing: t.layout.uppercaseKicker ? 2 : 0,
    });
  }
  s.addText(title, {
    x: m, y: 3.3, w: W - 2 * m - 0.8, h: 1.3, margin: 0, fontFace: t.fonts.heading,
    fontSize: t.type.deckTitle - 4, bold: true, color: p.inkInverse,
  });
  return s;
}

// Returns { slide, top } — `top` is where body content may start.
export function contentSlide(pptx: any, t: Theme, title: string, kicker?: string) {
  const p = t.palette;
  const m = margin(t);
  const s = pptx.addSlide();
  s.background = { color: p.bg };
  let y = m;
  if (kicker) {
    s.addText(kickerText(t, kicker), {
      x: m, y, w: W - 2 * m, h: 0.3, margin: 0, fontFace: t.fonts.body,
      fontSize: t.type.slideKicker, bold: true, color: p.accent,
      charSpacing: t.layout.uppercaseKicker ? 2 : 0,
    });
    y += 0.34;
  }
  s.addText(title, {
    x: m, y, w: W - 2 * m, h: 0.8, margin: 0, fontFace: t.fonts.heading,
    fontSize: t.type.slideTitle, bold: true, color: p.primary,
  });
  return { slide: s, top: y + 1.0 };
}

export function lede(slide: any, t: Theme, text: string, y: number): number {
  const m = margin(t);
  slide.addText(text, {
    x: m, y, w: W - 2 * m, h: 0.6, margin: 0, fontFace: t.fonts.body,
    fontSize: t.type.slideBody, color: t.palette.inkMuted,
  });
  return y + 0.8;
}

function card(slide: any, t: Theme, x: number, y: number, w: number, h: number) {
  const p = t.palette;
  const opts: any = {
    x, y, w, h,
    fill: { color: p.surface },
    line: { color: p.line, width: 0.75 },
    rectRadius: t.layout.radius / 72,
  };
  if (t.layout.cardShadow) {
    opts.shadow = { type: "outer", color: "9AA5B1", blur: 8, offset: 2, angle: 90, opacity: 0.25 };
  }
  slide.addShape("roundRect", opts);
}

export function cardGrid(slide: any, t: Theme, cards: Card[], top: number) {
  const p = t.palette;
  const m = margin(t);
  const cols = cards.length <= 3 ? cards.length : cards.length === 4 ? 2 : 3;
  const rows = Math.ceil(cards.length / cols);
  const gap = 0.3;
  const cw = (W - 2 * m - gap * (cols - 1)) / cols;
  const avail = H - top - 1.0;
  const max = (avail - gap * (rows - 1)) / rows;
  // Height follows the longest body, so a short card is not a mostly-empty box.
  const charsPerLine = Math.max(12, Math.round((cw - 0.5) * 10.5));
  const lines = cards.reduce(
    (n, c) => Math.max(n, Math.ceil(c.body.length / charsPerLine)),
    1
  );
  const ch = Math.max(1.1, Math.min(max, 0.95 + lines * 0.26));
  cards.forEach((c, i) => {
    const x = m + (i % cols) * (cw + gap);
    const y = top + Math.floor(i / cols) * (ch + gap);
    card(slide, t, x, y, cw, ch);
    slide.addText(c.head, {
      x: x + 0.25, y: y + 0.18, w: cw - 0.5, h: 0.42, margin: 0,
      fontFace: t.fonts.heading, fontSize: t.type.slideBody + 2, bold: true, color: p.ink,
    });
    slide.addText(c.body, {
      x: x + 0.25, y: y + 0.64, w: cw - 0.5, h: ch - 0.85, margin: 0, valign: "top",
      fontFace: t.fonts.body, fontSize: t.type.slideBody - 2, color: p.inkMuted,
    });
  });
}

// A row (or 2x3 grid) of numbered tiles. Used for short bullets, which as a
// plain list leave two thirds of the slide empty.
export function pillarGrid(slide: any, t: Theme, items: string[], top: number) {
  const p = t.palette;
  const m = margin(t);
  const cols = items.length <= 3 ? items.length : items.length === 4 ? 2 : 3;
  const rows = Math.ceil(items.length / cols);
  const gap = 0.3;
  const cw = (W - 2 * m - gap * (cols - 1)) / cols;
  const avail = H - top - 1.0;
  const longest = items.reduce((n, s2) => Math.max(n, s2.length), 0);
  const labelLines = longest > Math.round((cw - 0.5) * 7) ? 2 : 1;
  const ch = Math.max(1.4, Math.min((avail - gap * (rows - 1)) / rows, 1.25 + labelLines * 0.32));
  items.forEach((label, i) => {
    const x = m + (i % cols) * (cw + gap);
    const y = top + Math.floor(i / cols) * (ch + gap);
    card(slide, t, x, y, cw, ch);
    slide.addText(String(i + 1).padStart(2, "0"), {
      x: x + 0.25, y: y + 0.22, w: cw - 0.5, h: 0.7, margin: 0,
      fontFace: t.fonts.heading, fontSize: Math.round(t.type.slideTitle * 0.95),
      bold: true, color: p.accent,
    });
    slide.addText(label, {
      x: x + 0.25, y: y + 0.95, w: cw - 0.5, h: ch - 1.15, margin: 0, valign: "top",
      fontFace: t.fonts.heading, fontSize: t.type.slideBody + 3, bold: true, color: p.ink,
    });
  });
}

function bulletRuns(t: Theme, items: string[]) {
  return items.map((text, i) => ({
    text,
    options: {
      bullet: true, breakLine: i < items.length - 1, paraSpaceAfter: 8,
      fontFace: t.fonts.body, fontSize: t.type.slideBody, color: t.palette.ink,
    },
  }));
}

export function bulletList(slide: any, t: Theme, items: string[], top: number) {
  const m = margin(t);
  const h = H - top - 0.9;
  // Past six items a single column runs off the slide; split into two.
  if (items.length > 6) {
    const half = Math.ceil(items.length / 2);
    const cw = (W - 2 * m - 0.5) / 2;
    slide.addText(bulletRuns(t, items.slice(0, half)), {
      x: m, y: top, w: cw, h, margin: 0, valign: "top",
    });
    slide.addText(bulletRuns(t, items.slice(half)), {
      x: m + cw + 0.5, y: top, w: cw, h, margin: 0, valign: "top",
    });
    return;
  }
  slide.addText(bulletRuns(t, items), {
    x: m, y: top, w: W - 2 * m, h, margin: 0, valign: "top",
  });
}

export function prose(slide: any, t: Theme, lines: string[], top: number) {
  const m = margin(t);
  // Cap the measure: a 12-inch line of body text is unreadable.
  const w = Math.min(W - 2 * m, 9.2);
  slide.addText(lines.join("\n"), {
    x: m, y: top, w, h: H - top - 0.9, margin: 0, valign: "top",
    fontFace: t.fonts.body, fontSize: t.type.slideBody, color: t.palette.ink,
    lineSpacingMultiple: 1.25,
  });
}

export function table(slide: any, t: Theme, header: string[], rows: string[][], top: number) {
  const p = t.palette;
  const m = margin(t);
  const head = header.map((h) => ({
    text: h,
    options: { bold: true, color: p.inkInverse, fill: { color: p.primary } },
  }));
  const body = rows.map((r, i) =>
    r.map((c) => ({
      text: String(c),
      options: { color: p.ink, fill: { color: i % 2 ? p.surface : p.bg } },
    }))
  );
  slide.addTable([head, ...body], {
    x: m, y: top, w: W - 2 * m,
    fontFace: t.fonts.body, fontSize: t.type.slideBody - 2,
    border: { type: "solid", color: p.line, pt: 0.5 },
    rowH: 0.36, valign: "middle", margin: [4, 8, 4, 8],
  });
}

export function footer(slide: any, t: Theme, label: string, page: number) {
  const p = t.palette;
  const m = margin(t);
  slide.addText(label, {
    x: m, y: H - 0.45, w: W - 2 * m - 0.7, h: 0.3, margin: 0,
    fontFace: t.fonts.body, fontSize: t.type.slideCaption, color: p.inkMuted,
  });
  slide.addText(String(page), {
    x: W - m - 0.7, y: H - 0.45, w: 0.7, h: 0.3, margin: 0, align: "right",
    fontFace: t.fonts.body, fontSize: t.type.slideCaption, color: p.inkMuted,
  });
}
