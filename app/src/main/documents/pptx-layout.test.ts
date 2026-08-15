import { describe, expect, test } from "bun:test";
import { parseBlocks } from "./parse-md";
import { toSlides } from "./pptx-layout";

const slidesFor = (md: string, title = "Deck") => toSlides(title, parseBlocks(md));

describe("toSlides", () => {
  test("the opening heading becomes the cover, with its paragraph as subtitle", () => {
    const s = slidesFor("# Portfolio Overview\n\nA layered defence.\n\n## Detail\n\nBody text.\n");
    expect(s[0].kind).toBe("cover");
    expect(s[0].title).toBe("Portfolio Overview");
    expect(s[0].subtitle).toBe("A layered defence.");
    expect(s.filter((x) => x.kind === "cover").length).toBe(1);
  });

  test("content with no opening heading still gets a cover", () => {
    const s = slidesFor("## First\n\n- a\n- b\n");
    expect(s[0].kind).toBe("cover");
    expect(s[0].title).toBe("Deck");
  });

  test("label bullets become a card grid", () => {
    const s = slidesFor(
      "# T\n\nIntro.\n\n## Risks\n\n- Supply Chain: one vendor can bring down operations.\n" +
        "- Ransomware: encrypting systems and demanding payment for their return.\n"
    );
    const slide = s.find((x) => x.title === "Risks")!;
    expect(slide.bodyKind).toBe("cards");
    expect(slide.cards?.[0].head).toBe("Supply Chain");
  });

  test("plain bullets stay bullets", () => {
    const s = slidesFor("# T\n\nIntro.\n\n## Notes\n\n- first thing\n- second thing\n");
    expect(s.find((x) => x.title === "Notes")!.bodyKind).toBe("bullets");
  });

  test("a pipe table becomes a table slide, not stray text", () => {
    const s = slidesFor("# T\n\nIntro.\n\n## Data\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n");
    const slide = s.find((x) => x.title === "Data")!;
    expect(slide.bodyKind).toBe("table");
    expect(slide.table?.header).toEqual(["A", "B"]);
    expect(slide.table?.rows).toEqual([["1", "2"]]);
  });

  test("a heading-only slide becomes a divider", () => {
    const s = slidesFor("# T\n\nIntro.\n\n# Part Two\n\n## Real\n\nBody.\n");
    expect(s.find((x) => x.title === "Part Two")!.kind).toBe("section");
  });

  test("slides under a level-1 heading carry it as a kicker", () => {
    const s = slidesFor("# T\n\nIntro.\n\n# Pillars\n\n## Identity\n\nBody.\n");
    expect(s.find((x) => x.title === "Identity")!.kicker).toBe("Pillars");
  });
});
