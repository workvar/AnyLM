// Blocks → slide specs. This is the step the old builder never had: it decides
// what SHAPE each slide is (cover, divider, card grid, table, prose) instead of
// dumping every block into one text box.

export type SlideKind = "cover" | "section" | "content" | "closing";
export type BodyKind = "cards" | "pillars" | "bullets" | "prose" | "table";

export interface Card {
  head: string;
  body: string;
}

export interface SlideSpec {
  kind: SlideKind;
  title: string;
  subtitle?: string;
  kicker?: string;
  bodyKind: BodyKind;
  lede?: string;
  cards?: Card[];
  bullets?: string[];
  pillars?: string[];
  prose?: string[];
  table?: { header: string[]; rows: string[][] };
}

// Short bullets ("Open source", "ACID compliant") read as a feature row, not a
// list. Anything longer is a real sentence and stays a bullet.
const PILLAR_MAX_CHARS = 34;

const CLOSING = /^(conclusion|summary|wrap[- ]?up|next steps?|takeaways?|in closing|thank you)\b/i;

// "Adaptive MFA: goes beyond SMS codes." → a card head and body.
function asCard(text: string): Card | null {
  const m = String(text).match(/^\s*([^:]{3,48}?)\s*[:—-]\s+(.{12,})$/);
  if (!m) return null;
  // A head with sentence punctuation is prose that happens to contain a colon.
  if (/[.!?]/.test(m[1])) return null;
  return { head: m[1].trim(), body: m[2].trim() };
}

function cardsFrom(bullets: string[]): Card[] | null {
  if (bullets.length < 2 || bullets.length > 6) return null;
  const cards = bullets.map(asCard);
  return cards.every(Boolean) ? (cards as Card[]) : null;
}

function classify(spec: SlideSpec): SlideSpec {
  if (spec.table) {
    spec.bodyKind = "table";
    return spec;
  }
  const cards = spec.bullets ? cardsFrom(spec.bullets) : null;
  if (cards) {
    spec.bodyKind = "cards";
    spec.cards = cards;
    delete spec.bullets;
    return spec;
  }
  const b = spec.bullets || [];
  if (b.length >= 2 && b.length <= 6 && b.every((x) => x.length <= PILLAR_MAX_CHARS)) {
    spec.bodyKind = "pillars";
    spec.pillars = b;
    delete spec.bullets;
    return spec;
  }
  spec.bodyKind = spec.bullets && spec.bullets.length ? "bullets" : "prose";
  return spec;
}

// A slide carrying only a heading is a divider, not an empty content slide.
function isEmpty(s: SlideSpec): boolean {
  return (
    !s.table &&
    !(s.bullets || []).length &&
    !(s.pillars || []).length &&
    !(s.prose || []).length &&
    !s.lede
  );
}

export function toSlides(title: unknown, blocks: any[]): SlideSpec[] {
  const docTitle = String(title || "Presentation");
  const out: SlideSpec[] = [];
  let cur: SlideSpec | null = null;
  // The most recent level-1 heading labels the slides beneath it.
  let section = "";

  const start = (heading: string, level: number) => {
    if (level === 1 && out.length > 0) section = heading;
    cur = {
      kind: level === 1 && out.length > 0 ? "section" : "content",
      title: heading,
      kicker: level === 1 ? undefined : section || undefined,
      bodyKind: "prose",
      bullets: [],
      prose: [],
    };
    if (CLOSING.test(heading)) cur.kind = "closing";
    out.push(cur);
  };
  const ensure = () => {
    if (!cur) start(docTitle, 2);
    return cur as SlideSpec;
  };

  for (const b of blocks) {
    if (b.kind === "heading" && b.level <= 2) {
      start(b.text, b.level);
      continue;
    }
    const s = ensure();
    if (b.kind === "table") {
      s.table = { header: b.header, rows: b.rows };
    } else if (b.kind === "bullet" || b.kind === "numbered") {
      (s.bullets as string[]).push(b.text);
    } else if (b.kind === "code") {
      for (const line of String(b.text).split("\n")) (s.prose as string[]).push(line);
    } else if (b.kind === "heading") {
      // h3+ inside a slide reads as a lead-in line, not a new slide.
      (s.prose as string[]).push(b.text);
    } else {
      (s.prose as string[]).push(b.text);
    }
  }

  // A leading prose line before bullets is a lede, not a body paragraph.
  for (const s of out) {
    if (s.prose && s.prose.length && (s.bullets || []).length) {
      s.lede = s.prose.shift();
    }
  }

  const slides = out.map((s) => {
    if (isEmpty(s) && s.kind === "content") s.kind = "section";
    return classify(s);
  });

  // Cover: the opening heading becomes the cover when it carries no real body,
  // taking its first paragraph as the subtitle. Only synthesise a cover when
  // the document dives straight into content.
  const first = slides[0];
  if (
    first &&
    first.kind !== "closing" &&
    !first.table &&
    !(first.bullets || []).length &&
    !(first.pillars || []).length
  ) {
    first.kind = "cover";
    first.subtitle = first.lede || (first.prose && first.prose[0]) || "";
    first.kicker = undefined;
    delete first.lede;
    first.prose = [];
  } else {
    slides.unshift({ kind: "cover", title: docTitle, bodyKind: "prose" });
  }
  return slides;
}
