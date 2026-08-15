import { describe, expect, test } from "bun:test";
import { normalizeFormat, toMarkdown } from "./normalize";

describe("normalizeFormat", () => {
  test("passes through known formats", () => {
    expect(normalizeFormat("pptx")).toBe("pptx");
    expect(normalizeFormat(".PDF")).toBe("pdf");
  });

  test("maps the words models actually send", () => {
    expect(normalizeFormat("Presentation")).toBe("pptx");
    expect(normalizeFormat("PowerPoint")).toBe("pptx");
    expect(normalizeFormat("Word Document")).toBe("docx");
    expect(normalizeFormat("spreadsheet")).toBe("xlsx");
    expect(normalizeFormat("a slide deck please")).toBe("pptx");
  });

  test("falls back to the title's extension", () => {
    expect(normalizeFormat(undefined, "quarterly.pptx")).toBe("pptx");
  });

  test("infers pptx from slide-shaped content", () => {
    const slides = [{ title: "One", bullets: ["a"] }, { title: "Two", bullets: ["b"] }];
    expect(normalizeFormat(undefined, "Deck", slides)).toBe("pptx");
  });

  test("never returns an unknown format", () => {
    expect(normalizeFormat(undefined)).toBe("pdf");
    expect(normalizeFormat(null, null, null)).toBe("pdf");
  });
});

describe("toMarkdown", () => {
  test("leaves markdown alone", () => {
    expect(toMarkdown("# Title\n\nBody.")).toBe("# Title\n\nBody.");
  });

  test("renders an array of slide objects instead of [object Object]", () => {
    const md = toMarkdown([
      { title: "Intro", bullets: ["First point", "Second point"] },
      { title: "Detail", content: "A paragraph." },
    ]);
    expect(md).toContain("## Intro");
    expect(md).toContain("- First point");
    expect(md).toContain("## Detail");
    expect(md).toContain("A paragraph.");
    expect(md).not.toContain("[object Object]");
  });

  test("unwraps a JSON string", () => {
    const md = toMarkdown('[{"heading":"One","points":["x"]}]');
    expect(md).toContain("## One");
    expect(md).toContain("- x");
  });

  test("handles a wrapper object with slides", () => {
    const md = toMarkdown({ title: "Deck", slides: [{ title: "S1", bullets: ["p"] }] });
    expect(md).toContain("# Deck");
    expect(md).toContain("## S1");
  });

  test("keeps unrecognised keys rather than dropping them", () => {
    expect(toMarkdown([{ author: "Yash", year: 2026 }])).toContain("- author: Yash");
  });

  test("empty input is empty, not \"null\"", () => {
    expect(toMarkdown(null)).toBe("");
    expect(toMarkdown(undefined)).toBe("");
  });
});
