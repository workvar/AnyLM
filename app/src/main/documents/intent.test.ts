import { describe, expect, test } from "bun:test";
import { detect, detectExplicit, promptBlock } from "./intent";

describe("document intent", () => {
  test("detects PDF create requests", () => {
    expect(detect("Please create a PDF about RSA")).toBe("pdf");
  });

  test("prompt tells the model not to claim success when the tool was declined", () => {
    const block = promptBlock("pdf");
    expect(block).toContain("generate_document");
    expect(block.toLowerCase()).toMatch(/declin|denied|fail|error/);
    expect(block).not.toMatch(/After the tool returns, tell the user the file is ready/);
  });

  test("prompt requires research then dense generate_document content", () => {
    const block = promptBlock("pdf");
    expect(block).toContain("web_search");
    expect(block).toContain("http_fetch");
    expect(block).toContain("generate_document");
    expect(block.toLowerCase()).toMatch(/paragraph|dense|complete|substantive|empty/);
    expect(block.toLowerCase()).toMatch(/declin|denied|fail|error/);
  });

  test("detectExplicit only returns a format the user named", () => {
    expect(detectExplicit("Create a PPT on Agentic Commerce")).toBe("pptx");
    expect(detectExplicit("make a pdf about RSA")).toBe("pdf");
    // "report" infers docx in detect(), but nothing was named — so we must not
    // overrule whatever format the model picks.
    expect(detect("write me a report on X")).toBe("docx");
    expect(detectExplicit("write me a report on X")).toBeNull();
    expect(detectExplicit("summarize this")).toBeNull();
  });

  test("prompt pins the format and asks for several sources", () => {
    const block = promptBlock("pptx");
    expect(block).toContain("The format is fixed: pptx");
    expect(block).toContain("3–5");
    expect(block.toLowerCase()).toContain("latest message");
  });
});
